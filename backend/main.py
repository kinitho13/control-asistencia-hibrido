import hmac
import os
import time
import secrets
from calendar import monthrange
from datetime import date, timedelta

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, aliased, sessionmaker

from auth import (
    buscar_usuario_login,
    crear_sesion,
    hash_password,
    proteger_operaciones,
    router as auth_router,
    usuario_actual_opcional,
    verificar_password,
)
from cronograma import router as cronograma_router
from database import engine
from gestiones import auditar, router as gestiones_router
from marcaciones import router as marcaciones_router
from models import (
    Asistencia,
    Base,
    CierreOficina,
    Festivo,
    Notificacion,
    RegistroAsistencia,
    Restriccion,
    SesionAcceso,
    Solicitud,
    Usuario,
)
from reemplazos import router as reemplazos_router

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
MODALIDADES_VALIDAS = {"CASA", "OFICINA"}
ROLES_VALIDOS = {"ADMIN", "LIDER", "USUARIO"}
LUNES = 0  # date.weekday(): lunes = 0
MIN_PASSWORD = 12  # Mínimo recomendado por OWASP

# Límite de intentos de login (en memoria: con varios workers usa Redis)
LOGIN_MAX_INTENTOS = 5
LOGIN_VENTANA_SEG = 300
_intentos_login: dict[str, list[float]] = {}

def _limpiar_intentos_antiguos() -> None:
    """Limpia entradas antiguas del diccionario de intentos para evitar fugas de memoria."""
    ahora = time.monotonic()
    claves_a_borrar = []
    for clave, intentos in _intentos_login.items():
        recientes = [t for t in intentos if ahora - t < LOGIN_VENTANA_SEG]
        if recientes:
            _intentos_login[clave] = recientes
        else:
            claves_a_borrar.append(clave)
    for clave in claves_a_borrar:
        _intentos_login.pop(clave, None)

produccion = os.getenv("APP_ENV", "development").lower() == "production"
origenes_permitidos = [
    o.strip()
    for o in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]
if produccion and not origenes_permitidos:
    raise RuntimeError("Configura CORS_ALLOWED_ORIGINS antes de iniciar en producción.")
if not produccion and not origenes_permitidos:
    origenes_permitidos = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://172.16.30.68:5173",
        "https://control-asistencia-hibrido.vercel.app",
    ]

DESCRIPCION_API = """
API del **sistema de asistencia híbrida**: programación de días en CASA u OFICINA,
restricciones entre compañeros, festivos de Colombia y cierres de oficina.

**Reglas principales**
- Los lunes todos van a la oficina.
- No se programa en fines de semana, festivos ni cierres de oficina.
- Dos usuarios con restricción no pueden estar en CASA el mismo día.
"""

app = FastAPI(
    title="Sistema de asistencia",
    description=DESCRIPCION_API,
    version="2.0.0",
    docs_url=None if produccion else "/docs",
    redoc_url=None if produccion else "/redoc",
    openapi_url=None if produccion else "/openapi.json",
    dependencies=[Depends(proteger_operaciones)],
)

# En producción solo se aceptan los orígenes configurados.
# En desarrollo también se acepta localhost/IPs de red local en el puerto 5173.
opciones_cors: dict = {"allow_origins": origenes_permitidos}
if not produccion:
    # En desarrollo solo permitimos localhost e IPs privadas en puerto 5173
    opciones_cors["allow_origin_regex"] = r"^https?://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}):5173$"

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    **opciones_cors,
)

app.include_router(cronograma_router)
app.include_router(reemplazos_router)
app.include_router(gestiones_router)
app.include_router(marcaciones_router)
app.include_router(auth_router)

Base.metadata.create_all(bind=engine)
SessionLocal = sessionmaker(bind=engine)


def get_db():
    """Abre una sesión por petición y la cierra siempre, incluso si hay errores."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Esquemas de entrada (los secretos viajan en el cuerpo, nunca en la URL)
# ---------------------------------------------------------------------------
class LoginInput(BaseModel):
    usuario: str
    password: str


class UsuarioCrear(BaseModel):
    nombre: str
    usuario: str | None = None
    password: str | None = None
    rol: str = "USUARIO"
    actor_id: int | None = None


class CredencialesInput(BaseModel):
    usuario: str
    rol: str
    activo: bool
    password: str | None = None
    actor_id: int | None = None


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def obtener_usuario_o_404(db: Session, usuario_id: int) -> Usuario:
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail=f"El usuario {usuario_id} no existe.")
    return usuario


def obtener_usuario_activo(db: Session, usuario_id: int) -> Usuario:
    usuario = obtener_usuario_o_404(db, usuario_id)
    if not usuario.activo:
        raise HTTPException(status_code=400, detail="El usuario está inactivo.")
    return usuario


def obtener_actor(
    db: Session,
    actor_id: int | None,
    usuario_sesion: Usuario | None,
) -> Usuario | None:
    """
    Responsable del cambio. Se toma siempre de la sesión; si el cliente envía
    actor_id, debe coincidir con ella.
    """
    if actor_id is not None:
        if not usuario_sesion:
            raise HTTPException(
                status_code=401,
                detail="Inicia sesión para registrar el responsable del cambio.",
            )
        if actor_id != usuario_sesion.id:
            raise HTTPException(status_code=403, detail="El responsable no coincide con la sesión.")
    if not usuario_sesion:
        return None
    return db.query(Usuario).filter(Usuario.id == usuario_sesion.id).first()


def exigir_admin(usuario_sesion: Usuario | None) -> None:
    if not usuario_sesion:
        raise HTTPException(status_code=401, detail="Inicia sesión para continuar.")
    if usuario_sesion.rol != "ADMIN":
        raise HTTPException(status_code=403, detail="Solo un administrador puede hacer esto.")


def es_ultimo_admin(db: Session, usuario: Usuario) -> bool:
    """True si el usuario es el único ADMIN activo."""
    if usuario.rol != "ADMIN" or not usuario.activo:
        return False
    otro = (
        db.query(Usuario.id)
        .filter(Usuario.rol == "ADMIN", Usuario.activo.is_(True), Usuario.id != usuario.id)
        .first()
    )
    return otro is None


def notificar_activos(db: Session, mensaje: str, excluir_id: int | None = None) -> None:
    ids = [
        id_
        for (id_,) in db.query(Usuario.id).filter(Usuario.activo.is_(True)).all()
        if id_ != excluir_id
    ]
    db.add_all(Notificacion(usuario_id=id_, mensaje=mensaje) for id_ in ids)


def validar_anio_mes(anio: int, mes: int) -> None:
    if not 2000 <= anio <= 2100:
        raise HTTPException(status_code=400, detail="El año debe estar entre 2000 y 2100.")
    if not 1 <= mes <= 12:
        raise HTTPException(status_code=400, detail="El mes debe estar entre 1 y 12.")


def validar_nombre(db: Session, nombre: str, excluir_id: int | None = None) -> str:
    """Limpia el nombre y verifica que no esté vacío ni repetido (sin distinguir mayúsculas)."""
    nombre = nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío.")

    consulta = db.query(Usuario).filter(func.lower(Usuario.nombre) == nombre.lower())
    if excluir_id is not None:
        consulta = consulta.filter(Usuario.id != excluir_id)

    if consulta.first():
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese nombre.")

    return nombre


def normalizar_rol(rol: str) -> str:
    rol = rol.strip().upper()
    if rol not in ROLES_VALIDOS:
        raise HTTPException(status_code=400, detail="El rol seleccionado no es válido.")
    return rol


def validar_password(password: str) -> None:
    if len(password) < MIN_PASSWORD:
        raise HTTPException(
            status_code=400,
            detail=f"La contraseña debe tener al menos {MIN_PASSWORD} caracteres.",
        )


def usuarios_restringidos(db: Session, usuario_id: int) -> set[int]:
    """IDs de los usuarios que no pueden estar en CASA el mismo día que usuario_id."""
    restricciones = db.query(Restriccion).filter(
        or_(
            Restriccion.usuario1_id == usuario_id,
            Restriccion.usuario2_id == usuario_id,
        )
    ).all()

    return {
        r.usuario2_id if r.usuario1_id == usuario_id else r.usuario1_id
        for r in restricciones
    }


def cierres_en_rango(db: Session, inicio: date, fin: date) -> list[tuple[date, date]]:
    """Cierres de oficina que tocan el rango [inicio, fin] (una sola consulta)."""
    return [
        (i, f)
        for i, f in db.query(CierreOficina.fecha_inicio, CierreOficina.fecha_fin)
        .filter(CierreOficina.fecha_inicio <= fin, CierreOficina.fecha_fin >= inicio)
        .all()
    ]


def en_cierre(cierres: list[tuple[date, date]], fecha: date) -> bool:
    return any(i <= fecha <= f for i, f in cierres)


def oficina_cerrada(db: Session, fecha: date) -> bool:
    return (
        db.query(CierreOficina.id)
        .filter(CierreOficina.fecha_inicio <= fecha, CierreOficina.fecha_fin >= fecha)
        .first()
        is not None
    )


def asistencias_con_nombre(
    db: Session,
    desde: date | None = None,
    hasta: date | None = None,
    usuario_id: int | None = None,
) -> list[dict]:
    """Asistencias con el nombre del usuario, en una sola consulta (sin N+1)."""
    consulta = db.query(
        Asistencia.id,
        Asistencia.usuario_id,
        Usuario.nombre,
        Asistencia.fecha,
        Asistencia.modalidad,
    ).join(Usuario, Usuario.id == Asistencia.usuario_id)

    if desde is not None:
        consulta = consulta.filter(Asistencia.fecha >= desde)
    if hasta is not None:
        consulta = consulta.filter(Asistencia.fecha <= hasta)
    if usuario_id is not None:
        consulta = consulta.filter(Asistencia.usuario_id == usuario_id)

    filas = consulta.order_by(Asistencia.fecha, Usuario.nombre).all()

    return [
        {
            "id": id_,
            "usuario_id": uid,
            "usuario": nombre,
            "fecha": fecha,
            "modalidad": modalidad,
        }
        for id_, uid, nombre, fecha, modalidad in filas
    ]


# ---------------------------------------------------------------------------
# General
# ---------------------------------------------------------------------------
@app.get("/", tags=["General"])
def inicio():
    return {"mensaje": "Sistema funcionando"}


# ---------------------------------------------------------------------------
# Usuarios
# ---------------------------------------------------------------------------
@app.post("/usuarios", status_code=201, tags=["Usuarios"])
def crear_usuario(
    datos: UsuarioCrear,
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    exigir_admin(usuario_sesion)
    nombre = validar_nombre(db, datos.nombre)

    login = datos.usuario.strip() if datos.usuario else ""
    if bool(login) != bool(datos.password):
        raise HTTPException(
            status_code=400,
            detail="Para crear el acceso, ingresa el usuario de login y la contraseña.",
        )
    if datos.password:
        validar_password(datos.password)

    rol = normalizar_rol(datos.rol)

    if login and db.query(Usuario).filter(func.lower(Usuario.usuario) == login.lower()).first():
        raise HTTPException(status_code=409, detail="Ya existe ese usuario de login.")

    nuevo_usuario = Usuario(
        nombre=nombre,
        usuario=login or None,
        password=hash_password(datos.password) if datos.password else None,
        rol=rol,
    )
    db.add(nuevo_usuario)
    db.flush()
    auditar(
        db,
        obtener_actor(db, datos.actor_id, usuario_sesion),
        "CREAR",
        "usuario",
        nuevo_usuario.id,
        f"Creó el usuario {nombre} con rol {rol}.",
    )
    db.commit()
    db.refresh(nuevo_usuario)

    return {
        "id": nuevo_usuario.id,
        "nombre": nuevo_usuario.nombre,
        "usuario": nuevo_usuario.usuario,
        "rol": nuevo_usuario.rol,
    }


@app.get("/usuarios", tags=["Usuarios"])
def listar_usuarios(db: Session = Depends(get_db)):
    usuarios = db.query(Usuario).order_by(Usuario.nombre).all()
    return [
        {
            "id": u.id,
            "nombre": u.nombre,
            "usuario": u.usuario,
            "rol": u.rol,
            "activo": u.activo,
        }
        for u in usuarios
    ]


@app.put("/usuarios/{usuario_id}", tags=["Usuarios"])
def editar_usuario(
    usuario_id: int,
    nombre: str,
    actor_id: int | None = None,
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    usuario = obtener_usuario_o_404(db, usuario_id)

    nombre_anterior = usuario.nombre
    usuario.nombre = validar_nombre(db, nombre, excluir_id=usuario_id)
    auditar(
        db,
        obtener_actor(db, actor_id, usuario_sesion),
        "EDITAR",
        "usuario",
        usuario.id,
        f"Cambió el nombre de {nombre_anterior} a {usuario.nombre}.",
    )
    db.commit()
    db.refresh(usuario)

    return {"id": usuario.id, "nombre": usuario.nombre}


@app.put("/usuarios/{usuario_id}/credenciales", tags=["Usuarios"])
def actualizar_credenciales(
    usuario_id: int,
    datos: CredencialesInput,
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    exigir_admin(usuario_sesion)
    registro = obtener_usuario_o_404(db, usuario_id)

    login = datos.usuario.strip()
    if not login:
        raise HTTPException(status_code=400, detail="El usuario de login no puede estar vacío.")

    rol = normalizar_rol(datos.rol)

    duplicado = db.query(Usuario).filter(
        func.lower(Usuario.usuario) == login.lower(),
        Usuario.id != registro.id,
    ).first()
    if duplicado:
        raise HTTPException(status_code=409, detail="Ya existe ese usuario de login.")

    if datos.password:
        validar_password(datos.password)
    elif not registro.password:
        raise HTTPException(
            status_code=400,
            detail="Este usuario aún no tiene contraseña; ingresa una para habilitar su acceso.",
        )

    # No dejar el sistema sin administradores ni que alguien se bloquee a sí mismo
    if (rol != "ADMIN" or not datos.activo) and es_ultimo_admin(db, registro):
        raise HTTPException(
            status_code=409,
            detail="No puedes quitar el rol o desactivar al único administrador activo.",
        )
    if registro.id == usuario_sesion.id and not datos.activo:
        raise HTTPException(status_code=409, detail="No puedes desactivar tu propio usuario.")

    anterior = f"{registro.usuario} ({registro.rol}, {'activo' if registro.activo else 'inactivo'})"
    registro.usuario = login
    if datos.password:
        registro.password = hash_password(datos.password)
    registro.rol = rol
    registro.activo = datos.activo

    auditar(
        db,
        obtener_actor(db, datos.actor_id, usuario_sesion),
        "EDITAR",
        "usuario",
        registro.id,
        f"Actualizó accesos para {registro.nombre}; estado anterior: {anterior}.",
    )
    db.commit()

    return {"mensaje": "Usuario actualizado"}


@app.delete("/usuarios/{usuario_id}", tags=["Usuarios"])
def eliminar_usuario(
    usuario_id: int,
    actor_id: int | None = None,
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    exigir_admin(usuario_sesion)
    usuario = obtener_usuario_o_404(db, usuario_id)

    if usuario.id == usuario_sesion.id:
        raise HTTPException(status_code=409, detail="No puedes eliminar tu propio usuario.")
    if es_ultimo_admin(db, usuario):
        raise HTTPException(status_code=409, detail="No puedes eliminar al único administrador activo.")

    # Se eliminan también sus datos relacionados para no dejar registros huérfanos
    db.query(Asistencia).filter(Asistencia.usuario_id == usuario_id).delete(
        synchronize_session=False
    )
    db.query(Restriccion).filter(
        or_(
            Restriccion.usuario1_id == usuario_id,
            Restriccion.usuario2_id == usuario_id,
        )
    ).delete(synchronize_session=False)
    db.query(Solicitud).filter(Solicitud.usuario_id == usuario_id).delete(
        synchronize_session=False
    )
    db.query(Notificacion).filter(Notificacion.usuario_id == usuario_id).delete(
        synchronize_session=False
    )
    db.query(SesionAcceso).filter(SesionAcceso.usuario_id == usuario_id).delete(
        synchronize_session=False
    )
    db.query(RegistroAsistencia).filter(
        RegistroAsistencia.actualizado_por_id == usuario_id
    ).update({RegistroAsistencia.actualizado_por_id: None}, synchronize_session=False)
    db.query(RegistroAsistencia).filter(
        RegistroAsistencia.usuario_id == usuario_id
    ).delete(synchronize_session=False)

    auditar(
        db,
        obtener_actor(db, actor_id, usuario_sesion),
        "ELIMINAR",
        "usuario",
        usuario_id,
        f"Eliminó el usuario {usuario.nombre}.",
    )
    db.delete(usuario)
    db.commit()

    return {"mensaje": "Usuario eliminado"}


# ---------------------------------------------------------------------------
# Restricciones
# ---------------------------------------------------------------------------
@app.post("/restricciones", status_code=201, tags=["Restricciones"])
def crear_restriccion(
    usuario1_id: int,
    usuario2_id: int,
    db: Session = Depends(get_db),
):
    if usuario1_id == usuario2_id:
        raise HTTPException(
            status_code=400,
            detail="No se puede crear una restricción de un usuario consigo mismo.",
        )

    obtener_usuario_o_404(db, usuario1_id)
    obtener_usuario_o_404(db, usuario2_id)

    # Evita duplicados en cualquiera de los dos órdenes (A-B o B-A)
    existente = db.query(Restriccion).filter(
        or_(
            and_(
                Restriccion.usuario1_id == usuario1_id,
                Restriccion.usuario2_id == usuario2_id,
            ),
            and_(
                Restriccion.usuario1_id == usuario2_id,
                Restriccion.usuario2_id == usuario1_id,
            ),
        )
    ).first()

    if existente:
        raise HTTPException(status_code=409, detail="Esa restricción ya existe.")

    restriccion = Restriccion(usuario1_id=usuario1_id, usuario2_id=usuario2_id)
    db.add(restriccion)
    db.commit()
    db.refresh(restriccion)

    return {
        "id": restriccion.id,
        "usuario1_id": usuario1_id,
        "usuario2_id": usuario2_id,
    }


@app.get("/restricciones", tags=["Restricciones"])
def listar_restricciones(db: Session = Depends(get_db)):
    u1 = aliased(Usuario)
    u2 = aliased(Usuario)

    filas = (
        db.query(Restriccion.id, u1.nombre, u2.nombre, Restriccion.usuario1_id, Restriccion.usuario2_id)
        .join(u1, u1.id == Restriccion.usuario1_id)
        .join(u2, u2.id == Restriccion.usuario2_id)
        .order_by(Restriccion.id)
        .all()
    )

    return [
        {
            "id": id_,
            "usuario1": nombre1,
            "usuario2": nombre2,
            "usuario1_id": id1,
            "usuario2_id": id2,
        }
        for id_, nombre1, nombre2, id1, id2 in filas
    ]


@app.delete("/restricciones/{restriccion_id}", tags=["Restricciones"])
def eliminar_restriccion(restriccion_id: int, db: Session = Depends(get_db)):
    restriccion = db.query(Restriccion).filter(Restriccion.id == restriccion_id).first()

    if not restriccion:
        raise HTTPException(status_code=404, detail="Restricción no encontrada.")

    db.delete(restriccion)
    db.commit()

    return {"mensaje": "Restricción eliminada"}


# ---------------------------------------------------------------------------
# Asistencias
# ---------------------------------------------------------------------------
def normalizar_modalidad(modalidad: str) -> str:
    modalidad = modalidad.strip().upper()
    if modalidad not in MODALIDADES_VALIDAS:
        raise HTTPException(status_code=400, detail="La modalidad debe ser CASA u OFICINA.")
    return modalidad


def hay_conflicto_casa(
    db: Session, usuario_id: int, fecha: date, excluir_id: int | None = None
) -> bool:
    """True si algún usuario relacionado ya está en CASA ese día."""
    relacionados = usuarios_restringidos(db, usuario_id)
    if not relacionados:
        return False

    consulta = db.query(Asistencia.id).filter(
        Asistencia.usuario_id.in_(relacionados),
        Asistencia.fecha == fecha,
        Asistencia.modalidad == "CASA",
    )
    if excluir_id is not None:
        consulta = consulta.filter(Asistencia.id != excluir_id)

    return consulta.first() is not None


def validar_asistencia(
    db: Session,
    usuario_id: int,
    fecha: date,
    modalidad: str,
    excluir_id: int | None = None,
) -> None:
    """Reglas de negocio compartidas por crear y editar una asistencia."""
    if fecha.weekday() >= 5:
        raise HTTPException(
            status_code=400,
            detail="No se pueden registrar asistencias en fines de semana.",
        )

    # No se programa en festivos ni durante cierres de oficina.
    if db.query(Festivo.id).filter(Festivo.fecha == fecha).first() or oficina_cerrada(db, fecha):
        raise HTTPException(
            status_code=400,
            detail="No se pueden registrar asistencias en festivos o cierres de oficina.",
        )

    # Los lunes todos van a la oficina
    if fecha.weekday() == LUNES and modalidad == "CASA":
        raise HTTPException(status_code=400, detail="Los lunes todos deben estar en OFICINA.")

    # Sin duplicados para el mismo usuario y fecha
    consulta = db.query(Asistencia.id).filter(
        Asistencia.usuario_id == usuario_id,
        Asistencia.fecha == fecha,
    )
    if excluir_id is not None:
        consulta = consulta.filter(Asistencia.id != excluir_id)

    if consulta.first():
        raise HTTPException(
            status_code=409,
            detail="El usuario ya tiene una asignación para esa fecha.",
        )

    # Restricciones: un usuario relacionado no puede estar en CASA el mismo día
    if modalidad == "CASA" and hay_conflicto_casa(db, usuario_id, fecha, excluir_id):
        raise HTTPException(
            status_code=409,
            detail="No permitido. El usuario relacionado ya está asignado en CASA para esa fecha.",
        )


@app.post("/asistencias", status_code=201, tags=["Asistencias"])
def crear_asistencia(
    usuario_id: int,
    fecha: date,
    modalidad: str,
    actor_id: int | None = None,
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    modalidad = normalizar_modalidad(modalidad)
    obtener_usuario_activo(db, usuario_id)
    validar_asistencia(db, usuario_id, fecha, modalidad)

    asistencia = Asistencia(usuario_id=usuario_id, fecha=fecha, modalidad=modalidad)
    db.add(asistencia)
    db.flush()
    db.add(
        Notificacion(
            usuario_id=usuario_id,
            mensaje=f"Se registró tu asistencia en modalidad {modalidad} para el {fecha}.",
        )
    )
    auditar(
        db,
        obtener_actor(db, actor_id, usuario_sesion),
        "CREAR",
        "asistencia",
        asistencia.id,
        f"Asignación {modalidad} para usuario {usuario_id} el {fecha}.",
    )
    db.commit()
    db.refresh(asistencia)

    return {
        "id": asistencia.id,
        "usuario_id": usuario_id,
        "fecha": fecha,
        "modalidad": modalidad,
    }


# Las rutas /asistencias/mes van ANTES que /asistencias/{asistencia_id}
# para que "mes" no se interprete como un id.
@app.post("/asistencias/mes", status_code=201, tags=["Asistencias"])
def generar_mes(
    usuario_id: int,
    fecha_inicio: date,
    modalidad: str = "CASA",
    actor_id: int | None = None,
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    """
    Genera asistencias de lunes a viernes desde fecha_inicio hasta fin de mes.
    - Lunes: OFICINA.
    - Demás días: la modalidad indicada (por defecto CASA); si una restricción lo impide, OFICINA.
    - Se omiten fines de semana, festivos, cierres y los días que ya tienen registro.
    """
    modalidad_base = normalizar_modalidad(modalidad)
    obtener_usuario_activo(db, usuario_id)

    ultimo_dia = monthrange(fecha_inicio.year, fecha_inicio.month)[1]
    fecha_fin = date(fecha_inicio.year, fecha_inicio.month, ultimo_dia)

    # Todo lo necesario se consulta una sola vez (antes era una consulta por día)
    festivos = {
        f for (f,) in db.query(Festivo.fecha)
        .filter(Festivo.fecha >= fecha_inicio, Festivo.fecha <= fecha_fin)
        .all()
    }
    cierres = cierres_en_rango(db, fecha_inicio, fecha_fin)
    ya_registrados = {
        f for (f,) in db.query(Asistencia.fecha)
        .filter(
            Asistencia.usuario_id == usuario_id,
            Asistencia.fecha >= fecha_inicio,
            Asistencia.fecha <= fecha_fin,
        )
        .all()
    }
    relacionados = usuarios_restringidos(db, usuario_id)
    dias_casa_relacionados = set()
    if relacionados:
        dias_casa_relacionados = {
            f for (f,) in db.query(Asistencia.fecha)
            .filter(
                Asistencia.usuario_id.in_(relacionados),
                Asistencia.modalidad == "CASA",
                Asistencia.fecha >= fecha_inicio,
                Asistencia.fecha <= fecha_fin,
            )
            .all()
        }

    nuevas = []
    omitidos = 0

    for dia in range(fecha_inicio.day, ultimo_dia + 1):
        fecha = date(fecha_inicio.year, fecha_inicio.month, dia)

        if fecha.weekday() >= 5 or fecha in festivos or en_cierre(cierres, fecha):
            continue
        if fecha in ya_registrados:
            omitidos += 1
            continue

        modalidad_dia = "OFICINA" if fecha.weekday() == LUNES else modalidad_base
        if modalidad_dia == "CASA" and fecha in dias_casa_relacionados:
            modalidad_dia = "OFICINA"

        nuevas.append(Asistencia(usuario_id=usuario_id, fecha=fecha, modalidad=modalidad_dia))

    db.add_all(nuevas)
    if nuevas:
        db.add(
            Notificacion(
                usuario_id=usuario_id,
                mensaje=f"Se generaron {len(nuevas)} asignaciones de asistencia desde el {fecha_inicio}.",
            )
        )
        auditar(
            db,
            obtener_actor(db, actor_id, usuario_sesion),
            "GENERAR",
            "asistencia",
            None,
            f"Generó {len(nuevas)} asignaciones para usuario {usuario_id} desde {fecha_inicio}.",
        )
    db.commit()

    return {
        "registros": len(nuevas),
        "omitidos": omitidos,
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin,
    }


@app.delete("/asistencias/mes", tags=["Asistencias"])
def eliminar_mes(
    anio: int,
    mes: int,
    usuario_id: int | None = None,
    actor_id: int | None = None,
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    """Elimina las asistencias de un mes (de todos los usuarios o de uno solo)."""
    validar_anio_mes(anio, mes)

    inicio = date(anio, mes, 1)
    fin = date(anio, mes, monthrange(anio, mes)[1])

    consulta = db.query(Asistencia).filter(Asistencia.fecha >= inicio, Asistencia.fecha <= fin)
    if usuario_id is not None:
        consulta = consulta.filter(Asistencia.usuario_id == usuario_id)

    ids_afectados = {
        id_
        for (id_,) in consulta.with_entities(Asistencia.usuario_id).distinct().all()
    }
    eliminados = consulta.delete(synchronize_session=False)
    if eliminados:
        db.add_all(
            Notificacion(
                usuario_id=id_,
                mensaje=f"Se eliminaron asignaciones de asistencia de {anio}-{mes:02d}.",
            )
            for id_ in ids_afectados
        )
        auditar(
            db,
            obtener_actor(db, actor_id, usuario_sesion),
            "ELIMINAR",
            "asistencia",
            None,
            f"Eliminó {eliminados} asignaciones de {anio}-{mes:02d}.",
        )
    db.commit()

    return {"eliminados": eliminados}


@app.put("/asistencias/{asistencia_id}", tags=["Asistencias"])
def editar_asistencia(
    asistencia_id: int,
    fecha: date,
    modalidad: str,
    actor_id: int | None = None,
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    asistencia = db.query(Asistencia).filter(Asistencia.id == asistencia_id).first()
    if not asistencia:
        raise HTTPException(status_code=404, detail="Asistencia no encontrada.")

    modalidad = normalizar_modalidad(modalidad)
    validar_asistencia(db, asistencia.usuario_id, fecha, modalidad, excluir_id=asistencia_id)

    anterior = f"{asistencia.fecha} {asistencia.modalidad}"
    asistencia.fecha = fecha
    asistencia.modalidad = modalidad
    auditar(
        db,
        obtener_actor(db, actor_id, usuario_sesion),
        "EDITAR",
        "asistencia",
        asistencia.id,
        f"Cambió {anterior} a {fecha} {modalidad}.",
    )
    db.add(
        Notificacion(
            usuario_id=asistencia.usuario_id,
            mensaje=f"Tu asistencia del {fecha} se actualizó a {modalidad}.",
        )
    )
    db.commit()
    db.refresh(asistencia)

    return {
        "id": asistencia.id,
        "usuario_id": asistencia.usuario_id,
        "fecha": asistencia.fecha,
        "modalidad": asistencia.modalidad,
    }


@app.delete("/asistencias/{asistencia_id}", tags=["Asistencias"])
def eliminar_asistencia(
    asistencia_id: int,
    actor_id: int | None = None,
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    asistencia = db.query(Asistencia).filter(Asistencia.id == asistencia_id).first()
    if not asistencia:
        raise HTTPException(status_code=404, detail="Asistencia no encontrada.")

    auditar(
        db,
        obtener_actor(db, actor_id, usuario_sesion),
        "ELIMINAR",
        "asistencia",
        asistencia.id,
        f"Eliminó asignación {asistencia.modalidad} del {asistencia.fecha}.",
    )
    db.add(
        Notificacion(
            usuario_id=asistencia.usuario_id,
            mensaje=f"Se eliminó tu asignación de asistencia del {asistencia.fecha}.",
        )
    )
    db.delete(asistencia)
    db.commit()

    return {"mensaje": "Asistencia eliminada"}


@app.get("/asistencias", tags=["Asistencias"])
def listar_asistencias(
    desde: date | None = None,
    hasta: date | None = None,
    usuario_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Sin parámetros devuelve todo (como antes); con desde/hasta/usuario_id filtra."""
    return asistencias_con_nombre(db, desde, hasta, usuario_id)


@app.get("/calendario", tags=["Calendario"])
def calendario(
    desde: date | None = None,
    hasta: date | None = None,
    usuario_id: int | None = None,
    db: Session = Depends(get_db),
):
    return asistencias_con_nombre(db, desde, hasta, usuario_id)


@app.get("/calendario/resumen", tags=["Calendario"])
def resumen_calendario(anio: int, mes: int, db: Session = Depends(get_db)):
    """
    Resumen día por día de un mes, pensado para pintar el calendario:
    cuántos están en CASA / OFICINA y si el día es festivo, cierre o fin de semana.
    """
    validar_anio_mes(anio, mes)
    inicio = date(anio, mes, 1)
    fin = date(anio, mes, monthrange(anio, mes)[1])

    festivos = {
        f: descripcion
        for f, descripcion in db.query(Festivo.fecha, Festivo.descripcion)
        .filter(Festivo.fecha >= inicio, Festivo.fecha <= fin)
        .all()
    }
    cierres = cierres_en_rango(db, inicio, fin)

    conteos: dict[date, dict[str, int]] = {}
    filas = (
        db.query(Asistencia.fecha, Asistencia.modalidad, func.count(Asistencia.id))
        .filter(Asistencia.fecha >= inicio, Asistencia.fecha <= fin)
        .group_by(Asistencia.fecha, Asistencia.modalidad)
        .all()
    )
    for fecha, modalidad, total in filas:
        conteos.setdefault(fecha, {})[modalidad] = total

    dias = []
    for numero in range(1, fin.day + 1):
        fecha = date(anio, mes, numero)
        por_modalidad = conteos.get(fecha, {})
        dias.append(
            {
                "fecha": fecha,
                "dia_semana": fecha.weekday(),
                "fin_de_semana": fecha.weekday() >= 5,
                "festivo": festivos.get(fecha),
                "cierre_oficina": en_cierre(cierres, fecha),
                "casa": por_modalidad.get("CASA", 0),
                "oficina": por_modalidad.get("OFICINA", 0),
            }
        )

    return {"anio": anio, "mes": mes, "dias": dias}


# ---------------------------------------------------------------------------
# Festivos
# ---------------------------------------------------------------------------
def mover_a_lunes(fecha: date) -> date:
    """Ley Emiliani: el festivo pasa al lunes siguiente (si ya es lunes, se queda)."""
    return fecha + timedelta(days=(7 - fecha.weekday()) % 7)


def calcular_pascua(anio: int) -> date:
    """Domingo de Pascua (algoritmo gregoriano de Meeus/Jones/Butcher)."""
    a = anio % 19
    b = anio // 100
    c = anio % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451

    mes = (h + l - 7 * m + 114) // 31
    dia = ((h + l - 7 * m + 114) % 31) + 1

    return date(anio, mes, dia)


def festivos_colombia(anio: int) -> list[tuple[date, str]]:
    """Festivos oficiales de Colombia para un año."""
    pascua = calcular_pascua(anio)

    return [
        # Fijos
        (date(anio, 1, 1), "Año Nuevo"),
        (date(anio, 5, 1), "Día del Trabajo"),
        (date(anio, 7, 20), "Independencia"),
        (date(anio, 8, 7), "Batalla de Boyacá"),
        (date(anio, 12, 8), "Inmaculada Concepción"),
        (date(anio, 12, 25), "Navidad"),
        # Ley Emiliani (se trasladan al lunes)
        (mover_a_lunes(date(anio, 1, 6)), "Reyes Magos"),
        (mover_a_lunes(date(anio, 3, 19)), "San José"),
        (mover_a_lunes(date(anio, 6, 29)), "San Pedro y San Pablo"),
        (mover_a_lunes(date(anio, 8, 15)), "Asunción de la Virgen"),
        (mover_a_lunes(date(anio, 10, 12)), "Día de la Raza"),
        (mover_a_lunes(date(anio, 11, 1)), "Todos los Santos"),
        (mover_a_lunes(date(anio, 11, 11)), "Independencia de Cartagena"),
        # Semana Santa
        (pascua - timedelta(days=3), "Jueves Santo"),
        (pascua - timedelta(days=2), "Viernes Santo"),
        # Dependen de la Pascua (también se trasladan al lunes)
        (mover_a_lunes(pascua + timedelta(days=39)), "Ascensión"),
        (mover_a_lunes(pascua + timedelta(days=60)), "Corpus Christi"),
        (mover_a_lunes(pascua + timedelta(days=68)), "Sagrado Corazón"),
    ]


def cargar_festivos(db: Session, anio_inicio: int, anio_fin: int) -> int:
    """Inserta los festivos de Colombia del rango que aún no existan. Devuelve cuántos."""
    existentes = {
        f for (f,) in db.query(Festivo.fecha)
        .filter(
            Festivo.fecha >= date(anio_inicio, 1, 1),
            Festivo.fecha <= date(anio_fin, 12, 31),
        )
        .all()
    }

    nuevos = []
    for anio in range(anio_inicio, anio_fin + 1):
        for fecha, descripcion in festivos_colombia(anio):
            if fecha in existentes:
                continue
            existentes.add(fecha)
            nuevos.append(Festivo(fecha=fecha, descripcion=descripcion))

    db.add_all(nuevos)
    db.commit()
    return len(nuevos)


@app.post("/festivos/cargar-rango", tags=["Festivos"])
def cargar_festivos_rango(
    anio_inicio: int = 2026,
    anio_fin: int = 2070,
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    """Carga los festivos de Colombia calculados (Ley Emiliani y Semana Santa)."""
    exigir_admin(usuario_sesion)
    if not 2000 <= anio_inicio <= anio_fin <= 2100:
        raise HTTPException(status_code=400, detail="Rango de años inválido (2000-2100).")

    insertados = cargar_festivos(db, anio_inicio, anio_fin)
    return {"mensaje": "Festivos Colombia cargados", "insertados": insertados}


# Rutas antiguas, conservadas para no romper el frontend actual.
@app.post("/festivos/cargar-2026", deprecated=True, tags=["Festivos"])
def cargar_festivos_2026(
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    exigir_admin(usuario_sesion)
    return {"festivos_insertados": cargar_festivos(db, 2026, 2026)}


@app.post("/festivos/cargar-colombia", deprecated=True, tags=["Festivos"])
def cargar_festivos_colombia(
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    exigir_admin(usuario_sesion)
    return {"festivos_insertados": cargar_festivos(db, 2026, 2070)}


@app.post("/festivos", status_code=201, tags=["Festivos"])
def crear_festivo(
    fecha: date,
    descripcion: str,
    actor_id: int | None = None,
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    descripcion = descripcion.strip()
    if not descripcion:
        raise HTTPException(status_code=400, detail="La descripción no puede estar vacía.")

    if db.query(Festivo.id).filter(Festivo.fecha == fecha).first():
        raise HTTPException(status_code=409, detail="Ya existe un festivo en esa fecha.")

    actor = obtener_actor(db, actor_id, usuario_sesion)
    festivo = Festivo(fecha=fecha, descripcion=descripcion)
    db.add(festivo)
    db.flush()
    auditar(db, actor, "CREAR", "festivo", festivo.id, f"Creó festivo: {descripcion} ({fecha}).")
    notificar_activos(
        db,
        f"Se registró el festivo {descripcion} para el {fecha}.",
        excluir_id=actor.id if actor else None,
    )
    db.commit()
    db.refresh(festivo)

    return {"id": festivo.id, "fecha": fecha, "descripcion": descripcion}


@app.get("/festivos", tags=["Festivos"])
def listar_festivos(db: Session = Depends(get_db)):
    festivos = db.query(Festivo).order_by(Festivo.fecha).all()
    return [{"id": f.id, "fecha": f.fecha, "descripcion": f.descripcion} for f in festivos]


@app.put("/festivos/{festivo_id}", tags=["Festivos"])
def editar_festivo(
    festivo_id: int,
    fecha: date,
    descripcion: str,
    actor_id: int | None = None,
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    festivo = db.query(Festivo).filter(Festivo.id == festivo_id).first()
    if not festivo:
        raise HTTPException(status_code=404, detail="Festivo no encontrado.")

    descripcion = descripcion.strip()
    if not descripcion:
        raise HTTPException(status_code=400, detail="La descripción no puede estar vacía.")

    # La fecha no puede coincidir con otro festivo distinto de este
    repetido = db.query(Festivo.id).filter(
        Festivo.fecha == fecha,
        Festivo.id != festivo_id,
    ).first()
    if repetido:
        raise HTTPException(status_code=409, detail="Ya existe un festivo en esa fecha.")

    actor = obtener_actor(db, actor_id, usuario_sesion)
    festivo.fecha = fecha
    festivo.descripcion = descripcion
    auditar(db, actor, "EDITAR", "festivo", festivo.id, f"Actualizó festivo: {descripcion} ({fecha}).")
    notificar_activos(
        db,
        f"Se actualizó el calendario de festivos: {descripcion} ({fecha}).",
        excluir_id=actor.id if actor else None,
    )
    db.commit()
    db.refresh(festivo)

    return {"id": festivo.id, "fecha": festivo.fecha, "descripcion": festivo.descripcion}


@app.delete("/festivos/{festivo_id}", tags=["Festivos"])
def eliminar_festivo(
    festivo_id: int,
    actor_id: int | None = None,
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
    db: Session = Depends(get_db),
):
    festivo = db.query(Festivo).filter(Festivo.id == festivo_id).first()
    if not festivo:
        raise HTTPException(status_code=404, detail="Festivo no encontrado.")

    actor = obtener_actor(db, actor_id, usuario_sesion)
    auditar(
        db,
        actor,
        "ELIMINAR",
        "festivo",
        festivo.id,
        f"Eliminó festivo: {festivo.descripcion} ({festivo.fecha}).",
    )
    notificar_activos(
        db,
        f"Se eliminó el festivo {festivo.descripcion} del {festivo.fecha}.",
        excluir_id=actor.id if actor else None,
    )
    db.delete(festivo)
    db.commit()

    return {"mensaje": "Festivo eliminado"}


# ---------------------------------------------------------------------------
# Acceso
# ---------------------------------------------------------------------------
@app.post("/crear-admin", tags=["Acceso"])
def crear_admin(
    x_bootstrap_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Alta inicial del administrador. Solo funciona si aún no existe ninguno."""
    token_configurado = os.getenv("ADMIN_BOOTSTRAP_TOKEN")
    password_configurada = os.getenv("ADMIN_BOOTSTRAP_PASSWORD")
    if not token_configurado or not password_configurada:
        raise HTTPException(
            status_code=503,
            detail="El alta inicial de administrador no está configurada.",
        )
    if not x_bootstrap_token or not hmac.compare_digest(
        x_bootstrap_token.encode("utf-8"), token_configurado.encode("utf-8")
    ):
        raise HTTPException(status_code=403, detail="No autorizado.")
    if len(password_configurada) < 12:
        raise HTTPException(
            status_code=503,
            detail="ADMIN_BOOTSTRAP_PASSWORD debe tener al menos 12 caracteres.",
        )
    if db.query(Usuario.id).filter(Usuario.rol == "ADMIN").first():
        raise HTTPException(
            status_code=409,
            detail="Ya existe un administrador; el alta inicial está deshabilitada.",
        )

    admin = Usuario(
        nombre="Administrador",
        usuario="admin",
        password=hash_password(password_configurada),
        rol="ADMIN",
        activo=True,
    )
    db.add(admin)
    db.commit()
    return {"mensaje": "Administrador creado"}


def _intentos_recientes(clave: str) -> list[float]:
    ahora = time.monotonic()
    recientes = [t for t in _intentos_login.get(clave, []) if ahora - t < LOGIN_VENTANA_SEG]
    _intentos_login[clave] = recientes
    return recientes


@app.post("/login", tags=["Acceso"])
def login(
    datos: LoginInput,
    request: Request,
    db: Session = Depends(get_db),
):
    ip = request.client.host if request.client else "desconocida"
    clave = f"{ip}:{datos.usuario.strip().lower()}"

    # Limpieza periódica (1% de las peticiones) para evitar acumulación indefinida
    if secrets.randbelow(100) == 0:
        _limpiar_intentos_antiguos()

    if len(_intentos_recientes(clave)) >= LOGIN_MAX_INTENTOS:
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.",
        )

    error_credenciales = HTTPException(
        status_code=401,
        detail="Usuario o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.",
    )

    registro = buscar_usuario_login(db, datos.usuario)
    if not registro or not registro.password:
        _intentos_login[clave].append(time.monotonic())
        raise error_credenciales

    if not verificar_password(datos.password, registro.password):
        _intentos_login[clave].append(time.monotonic())
        raise error_credenciales

    # Solo se revela que está bloqueado cuando la contraseña ya fue correcta
    if not registro.activo:
        raise HTTPException(status_code=403, detail="Usuario bloqueado")

    _intentos_login.pop(clave, None)

    # Migra contraseñas antiguas al hash actual
    if not registro.password.startswith("pbkdf2_sha256$"):
        registro.password = hash_password(datos.password)

    token = crear_sesion(db, registro)
    db.commit()

    return {
        "id": registro.id,
        "nombre": registro.nombre,
        "usuario": registro.usuario,
        "rol": registro.rol,
        "token": token,
    }
