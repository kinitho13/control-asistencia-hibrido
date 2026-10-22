import calendar
from datetime import date
from datetime import date, timedelta

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, aliased, sessionmaker

from database import engine
from models import Asistencia, Base, Festivo, Restriccion, Usuario

from calendar import monthrange
from datetime import date, timedelta
import random
from cronograma import router
from reemplazos import router as reemplazos_router



# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
MODALIDADES_VALIDAS = {"CASA", "OFICINA"}
LUNES = 0  # date.weekday(): lunes = 0

app = FastAPI(title="Sistema de asistencia")

app.include_router(router)
app.include_router(reemplazos_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
# Utilidades
# ---------------------------------------------------------------------------
def obtener_usuario_o_404(db: Session, usuario_id: int) -> Usuario:
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail=f"El usuario {usuario_id} no existe.")
    return usuario


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


def asistencias_con_nombre(db: Session) -> list[dict]:
    """Asistencias con el nombre del usuario, en una sola consulta (sin N+1)."""
    filas = (
        db.query(
            Asistencia.id,
            Asistencia.usuario_id,
            Usuario.nombre,
            Asistencia.fecha,
            Asistencia.modalidad,
        )
        .join(Usuario, Usuario.id == Asistencia.usuario_id)
        .order_by(Asistencia.fecha, Usuario.nombre)
        .all()
    )

    return [
        {
            "id": id_,
            "usuario_id": usuario_id,
            "usuario": nombre,
            "fecha": fecha,
            "modalidad": modalidad,
        }
        for id_, usuario_id, nombre, fecha, modalidad in filas
    ]


# ---------------------------------------------------------------------------
# General
# ---------------------------------------------------------------------------
@app.get("/")
def inicio():
    return {"mensaje": "Sistema funcionando"}


# ---------------------------------------------------------------------------
# Usuarios
# ---------------------------------------------------------------------------
@app.post("/usuarios", status_code=201)
def crear_usuario(nombre: str, db: Session = Depends(get_db)):
    nombre = validar_nombre(db, nombre)

    usuario = Usuario(nombre=nombre)
    db.add(usuario)
    db.commit()
    db.refresh(usuario)

    return {"id": usuario.id, "nombre": usuario.nombre}


@app.get("/usuarios")
def listar_usuarios(db: Session = Depends(get_db)):
    usuarios = db.query(Usuario).order_by(Usuario.nombre).all()
    return [{"id": u.id, "nombre": u.nombre} for u in usuarios]


@app.put("/usuarios/{usuario_id}")
def editar_usuario(usuario_id: int, nombre: str, db: Session = Depends(get_db)):
    usuario = obtener_usuario_o_404(db, usuario_id)

    usuario.nombre = validar_nombre(db, nombre, excluir_id=usuario_id)
    db.commit()
    db.refresh(usuario)

    return {"id": usuario.id, "nombre": usuario.nombre}


@app.delete("/usuarios/{usuario_id}")
def eliminar_usuario(usuario_id: int, db: Session = Depends(get_db)):
    usuario = obtener_usuario_o_404(db, usuario_id)

    # Se eliminan también sus asistencias y restricciones para no dejar datos huérfanos
    db.query(Asistencia).filter(Asistencia.usuario_id == usuario_id).delete(
        synchronize_session=False
    )
    db.query(Restriccion).filter(
        or_(
            Restriccion.usuario1_id == usuario_id,
            Restriccion.usuario2_id == usuario_id,
        )
    ).delete(synchronize_session=False)

    db.delete(usuario)
    db.commit()

    return {"mensaje": "Usuario eliminado"}


# ---------------------------------------------------------------------------
# Restricciones
# ---------------------------------------------------------------------------
@app.post("/restricciones", status_code=201)
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


@app.get("/restricciones")
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


@app.delete("/restricciones/{restriccion_id}")
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
    """True si algun usuario relacionado ya esta en CASA ese dia."""
    relacionados = usuarios_restringidos(db, usuario_id)
    if not relacionados:
        return False

    consulta = db.query(Asistencia).filter(
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
    # No es festivo
    if db.query(Festivo).filter(Festivo.fecha == fecha).first():
        raise HTTPException(
            status_code=400,
            detail="No se pueden registrar asistencias en días festivos.",
        )

    # Los lunes todos van a la oficina
    if fecha.weekday() == LUNES and modalidad == "CASA":
        raise HTTPException(status_code=400, detail="Los lunes todos deben estar en OFICINA.")

    # Sin duplicados para el mismo usuario y fecha
    consulta = db.query(Asistencia).filter(
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


@app.post("/asistencias", status_code=201)
def crear_asistencia(
    usuario_id: int,
    fecha: date,
    modalidad: str,
    db: Session = Depends(get_db),
):
    modalidad = normalizar_modalidad(modalidad)
    obtener_usuario_o_404(db, usuario_id)
    validar_asistencia(db, usuario_id, fecha, modalidad)

    asistencia = Asistencia(usuario_id=usuario_id, fecha=fecha, modalidad=modalidad)
    db.add(asistencia)
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
@app.post("/asistencias/mes", status_code=201)
def generar_mes(
    usuario_id: int,
    fecha_inicio: date,
    modalidad: str = "CASA",
    db: Session = Depends(get_db),
):
    """
    Genera asistencias de lunes a viernes desde fecha_inicio hasta fin de mes.
    - Lunes: OFICINA.
    - Demás días: la modalidad indicada (por defecto CASA); si una restricción lo impide, OFICINA.
    - Se omiten festivos y los días que ya tienen registro.
    """
    modalidad_base = normalizar_modalidad(modalidad)
    obtener_usuario_o_404(db, usuario_id)

    ultimo_dia = calendar.monthrange(fecha_inicio.year, fecha_inicio.month)[1]
    fecha_fin = date(fecha_inicio.year, fecha_inicio.month, ultimo_dia)

    festivos = {
        fila[0]
        for fila in db.query(Festivo.fecha)
        .filter(Festivo.fecha >= fecha_inicio, Festivo.fecha <= fecha_fin)
        .all()
    }
    ya_registrados = {
        fila[0]
        for fila in db.query(Asistencia.fecha)
        .filter(
            Asistencia.usuario_id == usuario_id,
            Asistencia.fecha >= fecha_inicio,
            Asistencia.fecha <= fecha_fin,
        )
        .all()
    }

    nuevas = []
    omitidos = 0

    for dia in range(fecha_inicio.day, ultimo_dia + 1):
        fecha = date(fecha_inicio.year, fecha_inicio.month, dia)

        if fecha.weekday() >= 5 or fecha in festivos:  # fines de semana y festivos
            continue
        if fecha in ya_registrados:
            omitidos += 1
            continue

        modalidad_dia = "OFICINA" if fecha.weekday() == LUNES else modalidad_base
        if modalidad_dia == "CASA" and hay_conflicto_casa(db, usuario_id, fecha):
            modalidad_dia = "OFICINA"

        nuevas.append(Asistencia(usuario_id=usuario_id, fecha=fecha, modalidad=modalidad_dia))

    db.add_all(nuevas)
    db.commit()

    return {
        "registros": len(nuevas),
        "omitidos": omitidos,
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin,
    }


@app.delete("/asistencias/mes")
def eliminar_mes(
    anio: int,
    mes: int,
    usuario_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Elimina las asistencias de un mes (de todos los usuarios o de uno solo)."""
    if not 1 <= mes <= 12:
        raise HTTPException(status_code=400, detail="El mes debe estar entre 1 y 12.")

    inicio = date(anio, mes, 1)
    fin = date(anio, mes, calendar.monthrange(anio, mes)[1])

    consulta = db.query(Asistencia).filter(Asistencia.fecha >= inicio, Asistencia.fecha <= fin)
    if usuario_id is not None:
        consulta = consulta.filter(Asistencia.usuario_id == usuario_id)

    eliminados = consulta.delete(synchronize_session=False)
    db.commit()

    return {"eliminados": eliminados}


@app.put("/asistencias/{asistencia_id}")
def editar_asistencia(
    asistencia_id: int,
    fecha: date,
    modalidad: str,
    db: Session = Depends(get_db),
):
    asistencia = db.query(Asistencia).filter(Asistencia.id == asistencia_id).first()
    if not asistencia:
        raise HTTPException(status_code=404, detail="Asistencia no encontrada.")

    modalidad = normalizar_modalidad(modalidad)
    validar_asistencia(db, asistencia.usuario_id, fecha, modalidad, excluir_id=asistencia_id)

    asistencia.fecha = fecha
    asistencia.modalidad = modalidad
    db.commit()
    db.refresh(asistencia)

    return {
        "id": asistencia.id,
        "usuario_id": asistencia.usuario_id,
        "fecha": asistencia.fecha,
        "modalidad": asistencia.modalidad,
    }


@app.delete("/asistencias/{asistencia_id}")
def eliminar_asistencia(asistencia_id: int, db: Session = Depends(get_db)):
    asistencia = db.query(Asistencia).filter(Asistencia.id == asistencia_id).first()
    if not asistencia:
        raise HTTPException(status_code=404, detail="Asistencia no encontrada.")

    db.delete(asistencia)
    db.commit()

    return {"mensaje": "Asistencia eliminada"}


@app.get("/asistencias")
def listar_asistencias(db: Session = Depends(get_db)):
    return asistencias_con_nombre(db)


@app.get("/calendario")
def calendario(db: Session = Depends(get_db)):
    return asistencias_con_nombre(db)


# ---------------------------------------------------------------------------
# Festivos
# ---------------------------------------------------------------------------
@app.post("/festivos", status_code=201)
def crear_festivo(fecha: date, descripcion: str, db: Session = Depends(get_db)):
    descripcion = descripcion.strip()
    if not descripcion:
        raise HTTPException(status_code=400, detail="La descripción no puede estar vacía.")

    if db.query(Festivo).filter(Festivo.fecha == fecha).first():
        raise HTTPException(status_code=409, detail="Ya existe un festivo en esa fecha.")

    festivo = Festivo(fecha=fecha, descripcion=descripcion)
    db.add(festivo)
    db.commit()
    db.refresh(festivo)

    return {"id": festivo.id, "fecha": fecha, "descripcion": descripcion}

@app.post("/festivos/cargar-2026")
def cargar_festivos_2026():

    db = SessionLocal()

    festivos = [

        ("2026-01-01", "Año Nuevo"),
        ("2026-01-12", "Reyes Magos"),
        ("2026-03-23", "San José"),
        ("2026-04-02", "Jueves Santo"),
        ("2026-04-03", "Viernes Santo"),
        ("2026-05-01", "Día del Trabajo"),
        ("2026-05-18", "Ascensión"),
        ("2026-06-08", "Corpus Christi"),
        ("2026-06-15", "Sagrado Corazón"),
        ("2026-06-29", "San Pedro y San Pablo"),
        ("2026-07-20", "Independencia"),
        ("2026-08-07", "Batalla de Boyacá"),
        ("2026-08-17", "Asunción de la Virgen"),
        ("2026-10-12", "Día de la Raza"),
        ("2026-11-02", "Todos los Santos"),
        ("2026-11-16", "Independencia de Cartagena"),
        ("2026-12-08", "Inmaculada Concepción"),
        ("2026-12-25", "Navidad")

    ]

    insertados = 0

    for fecha, descripcion in festivos:

        existe = db.query(Festivo).filter(
            Festivo.fecha == fecha
        ).first()

        if not existe:

            db.add(
                Festivo(
                    fecha=date.fromisoformat(fecha),
                    descripcion=descripcion
                )
            )

            insertados += 1

    db.commit()
    db.close()

    return {
        "festivos_insertados": insertados
    }

@app.post("/festivos/cargar-colombia")
def cargar_festivos_2027():

    db = SessionLocal()

    festivos = [

        ("2027-01-01", "Año Nuevo"),
        ("2027-01-11", "Reyes Magos"),
        ("2027-03-22", "San José"),
        ("2027-03-25", "Jueves Santo"),
        ("2027-03-26", "Viernes Santo"),
        ("2027-05-01", "Día del Trabajo"),
        ("2027-05-17", "Ascensión"),
        ("2027-06-07", "Corpus Christi"),
        ("2027-06-14", "Sagrado Corazón"),
        ("2027-06-28", "San Pedro y San Pablo"),
        ("2027-07-20", "Independencia"),
        ("2027-08-07", "Batalla de Boyacá"),
        ("2027-08-16", "Asunción"),
        ("2027-10-18", "Día de la Raza"),
        ("2027-11-01", "Todos los Santos"),
        ("2027-11-15", "Independencia Cartagena"),
        ("2027-12-08", "Inmaculada Concepción"),
        ("2027-12-25", "Navidad")

    ]

    insertados = 0

    for fecha, descripcion in festivos:

        existe = db.query(Festivo).filter(
            Festivo.fecha == fecha
        ).first()

        if not existe:

            db.add(
                Festivo(
                    fecha=fecha,
                    descripcion=descripcion
                )
            )

            insertados += 1

    db.commit()
    db.close()

    return {
        "festivos_insertados": insertados
    }


@app.get("/festivos")
def listar_festivos(db: Session = Depends(get_db)):
    festivos = db.query(Festivo).order_by(Festivo.fecha).all()
    return [{"id": f.id, "fecha": f.fecha, "descripcion": f.descripcion} for f in festivos]


@app.put("/festivos/{festivo_id}")
def editar_festivo(
    festivo_id: int,
    fecha: date,
    descripcion: str,
    db: Session = Depends(get_db),
):
    festivo = db.query(Festivo).filter(Festivo.id == festivo_id).first()

    if not festivo:
        raise HTTPException(status_code=404, detail="Festivo no encontrado.")

    descripcion = descripcion.strip()
    if not descripcion:
        raise HTTPException(status_code=400, detail="La descripción no puede estar vacía.")

    # La fecha no puede coincidir con otro festivo distinto de este
    repetido = db.query(Festivo).filter(
        Festivo.fecha == fecha,
        Festivo.id != festivo_id,
    ).first()

    if repetido:
        raise HTTPException(status_code=409, detail="Ya existe un festivo en esa fecha.")

    festivo.fecha = fecha
    festivo.descripcion = descripcion
    db.commit()
    db.refresh(festivo)

    return {"id": festivo.id, "fecha": festivo.fecha, "descripcion": festivo.descripcion}


@app.delete("/festivos/{festivo_id}")
def eliminar_festivo(festivo_id: int, db: Session = Depends(get_db)):
    festivo = db.query(Festivo).filter(Festivo.id == festivo_id).first()

    if not festivo:
        raise HTTPException(status_code=404, detail="Festivo no encontrado.")

    db.delete(festivo)
    db.commit()

    return {"mensaje": "Festivo eliminado"}

from datetime import date, timedelta

def mover_a_lunes(fecha):

    while fecha.weekday() != 0:
        fecha += timedelta(days=1)

    return fecha


def calcular_pascua(anio):

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

@app.post("/festivos/cargar-rango")
def cargar_festivos_rango():

    db = SessionLocal()

    insertados = 0

    for anio in range(2026, 2071):

        pascua = calcular_pascua(anio)

        jueves_santo = pascua - timedelta(days=3)
        viernes_santo = pascua - timedelta(days=2)

        festivos = [

            # Fijos
            (date(anio, 1, 1), "Año Nuevo"),
            (date(anio, 5, 1), "Día del Trabajo"),
            (date(anio, 7, 20), "Independencia"),
            (date(anio, 8, 7), "Batalla de Boyacá"),
            (date(anio, 12, 8), "Inmaculada Concepción"),
            (date(anio, 12, 25), "Navidad"),

            # Ley Emiliani
            (mover_a_lunes(date(anio, 1, 6)), "Reyes Magos"),
            (mover_a_lunes(date(anio, 3, 19)), "San José"),
            (mover_a_lunes(date(anio, 6, 29)), "San Pedro y San Pablo"),
            (mover_a_lunes(date(anio, 8, 15)), "Asunción de la Virgen"),
            (mover_a_lunes(date(anio, 10, 12)), "Día de la Raza"),
            (mover_a_lunes(date(anio, 11, 1)), "Todos los Santos"),
            (mover_a_lunes(date(anio, 11, 11)), "Independencia de Cartagena"),

            # Semana Santa
            (jueves_santo, "Jueves Santo"),
            (viernes_santo, "Viernes Santo"),

            # Dependientes de Pascua
            (mover_a_lunes(pascua + timedelta(days=43)), "Ascensión"),
            (mover_a_lunes(pascua + timedelta(days=64)), "Corpus Christi"),
            (mover_a_lunes(pascua + timedelta(days=71)), "Sagrado Corazón")

        ]

        for fecha_festivo, descripcion in festivos:

            existe = db.query(Festivo).filter(
                Festivo.fecha == fecha_festivo
            ).first()

            if not existe:

                db.add(
                    Festivo(
                        fecha=fecha_festivo,
                        descripcion=descripcion
                    )
                )

                insertados += 1

    db.commit()
    db.close()

    return {
        "mensaje": "Festivos Colombia cargados",
        "insertados": insertados
    }

@app.get("/debug-usuarios")
def debug_usuarios(
    db: Session = Depends(get_db)
):

    usuarios = db.query(
        Usuario
    ).all()

    return [
        {
            "id": u.id,
            "nombre": u.nombre,
            "usuario": u.usuario,
            "rol": u.rol,
            "activo": u.activo
        }
        for u in usuarios
    ]
@app.post("/crear-admin")
def crear_admin(
    db: Session = Depends(get_db)
):

    existe = db.query(Usuario).filter(
        Usuario.usuario == "admin"
    ).first()

    if existe:
        return {
            "mensaje": "El administrador ya existe"
        }

    admin = Usuario(
        nombre="Administrador",
        usuario="admin",
        password="admin123",
        rol="ADMIN",
        activo=True
    )

    db.add(admin)

    db.commit()

    return {
        "mensaje": "Administrador creado"
    }
@app.post("/login")
def login(
    usuario: str,
    password: str,
    db: Session = Depends(get_db)
):

    registro = db.query(Usuario).filter(
        Usuario.usuario == usuario
    ).first()

    if not registro:

        raise HTTPException(
            status_code=401,
            detail="Usuario o contraseña incorrectos"
        )

    if not registro.activo:

        raise HTTPException(
            status_code=403,
            detail="Usuario bloqueado"
        )

    if registro.password != password:

        raise HTTPException(
            status_code=401,
            detail="Usuario o contraseña incorrectos"
        )

    return {
        "id": registro.id,
        "nombre": registro.nombre,
        "usuario": registro.usuario,
        "rol": registro.rol
    }
@app.put("/usuarios/{usuario_id}/credenciales")
def actualizar_credenciales(
    usuario_id: int,
    usuario: str,
    password: str,
    rol: str,
    activo: bool,
    db: Session = Depends(get_db)
):

    registro = db.query(Usuario).filter(
        Usuario.id == usuario_id
    ).first()

    if not registro:
        raise HTTPException(
            status_code=404,
            detail="Usuario no encontrado"
        )

    registro.usuario = usuario
    registro.password = password
    registro.rol = rol
    registro.activo = activo

    db.commit()

    return {
        "mensaje": "Usuario actualizado"
    }