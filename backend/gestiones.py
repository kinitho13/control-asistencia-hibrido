from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, sessionmaker

from database import engine
from auth import usuario_actual
from models import (
    Asistencia,
    Auditoria,
    CierreOficina,
    Festivo,
    Notificacion,
    Reemplazo,
    Restriccion,
    Solicitud,
    Suplente,
    Usuario,
)

router = APIRouter(tags=["gestiones"])
SessionLocal = sessionmaker(bind=engine)
MODALIDADES = {"CASA", "OFICINA"}
TIPOS_SOLICITUD = {"CAMBIO_MODALIDAD", "AUSENCIA", "REEMPLAZO"}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class SolicitudInput(BaseModel):
    usuario_id: int
    tipo: str
    fecha: date
    motivo: str = Field(min_length=3, max_length=2000)
    modalidad: str | None = None
    suplente_id: int | None = None


class ResolucionInput(BaseModel):
    revisor_id: int
    aprobar: bool
    respuesta: str | None = Field(default=None, max_length=2000)


class CierreInput(BaseModel):
    actor_id: int
    fecha_inicio: date
    fecha_fin: date
    descripcion: str = Field(min_length=1, max_length=200)


def usuario_activo(db: Session, usuario_id: int) -> Usuario:
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario or not usuario.activo:
        raise HTTPException(status_code=404, detail="Usuario no encontrado o inactivo.")
    return usuario


def verificar_rol(db: Session, usuario_id: int, roles: set[str]) -> Usuario:
    usuario = usuario_activo(db, usuario_id)
    if (usuario.rol or "").upper() not in roles:
        raise HTTPException(status_code=403, detail="No tienes permisos para esta acción.")
    return usuario


def notificar(db: Session, usuario_id: int, mensaje: str) -> None:
    db.add(Notificacion(usuario_id=usuario_id, mensaje=mensaje))


def auditar(
    db: Session,
    actor: Usuario | None,
    accion: str,
    entidad: str,
    entidad_id: int | None,
    detalle: str,
) -> None:
    db.add(
        Auditoria(
            actor_id=actor.id if actor else None,
            actor_nombre=actor.nombre if actor else "Sistema",
            accion=accion,
            entidad=entidad,
            entidad_id=entidad_id,
            detalle=detalle,
        )
    )


def en_cierre(db: Session, fecha: date) -> bool:
    return (
        db.query(CierreOficina.id)
        .filter(CierreOficina.fecha_inicio <= fecha, CierreOficina.fecha_fin >= fecha)
        .first()
        is not None
    )


def validar_cambio_asistencia(
    db: Session, solicitud: Solicitud, asistencia: Asistencia | None
) -> None:
    if solicitud.modalidad not in MODALIDADES:
        raise HTTPException(status_code=400, detail="La modalidad solicitada no es válida.")
    if db.query(Festivo.id).filter(Festivo.fecha == solicitud.fecha).first() or en_cierre(
        db, solicitud.fecha
    ):
        raise HTTPException(status_code=400, detail="La fecha es festivo o la oficina está cerrada.")
    if solicitud.fecha.weekday() == 0 and solicitud.modalidad == "CASA":
        raise HTTPException(status_code=400, detail="Los lunes todos deben estar en OFICINA.")

    existente = (
        db.query(Asistencia)
        .filter(
            Asistencia.usuario_id == solicitud.usuario_id,
            Asistencia.fecha == solicitud.fecha,
        )
        .first()
    )
    if existente and (asistencia is None or existente.id != asistencia.id):
        raise HTTPException(status_code=409, detail="Ya existe una asignación para esa fecha.")

    if solicitud.modalidad == "CASA":
        relacionados = db.query(Restriccion).filter(
            or_(
                Restriccion.usuario1_id == solicitud.usuario_id,
                Restriccion.usuario2_id == solicitud.usuario_id,
            )
        )
        ids_relacionados = {
            fila.usuario2_id
            if fila.usuario1_id == solicitud.usuario_id
            else fila.usuario1_id
            for fila in relacionados.all()
        }
        conflicto = db.query(Asistencia.id).filter(
            Asistencia.usuario_id.in_(ids_relacionados),
            Asistencia.fecha == solicitud.fecha,
            Asistencia.modalidad == "CASA",
        ).first()
        if conflicto:
            raise HTTPException(
                status_code=409,
                detail="Una persona relacionada ya está asignada en CASA para esa fecha.",
            )


def solicitud_dict(db: Session, solicitud: Solicitud) -> dict:
    usuario = db.query(Usuario).filter(Usuario.id == solicitud.usuario_id).first()
    suplente = (
        db.query(Suplente).filter(Suplente.id == solicitud.suplente_id).first()
        if solicitud.suplente_id
        else None
    )
    revisor = (
        db.query(Usuario).filter(Usuario.id == solicitud.revisada_por_id).first()
        if solicitud.revisada_por_id
        else None
    )
    return {
        "id": solicitud.id,
        "usuario_id": solicitud.usuario_id,
        "usuario": usuario.nombre if usuario else "Usuario eliminado",
        "tipo": solicitud.tipo,
        "fecha": solicitud.fecha,
        "modalidad": solicitud.modalidad,
        "suplente_id": solicitud.suplente_id,
        "suplente": suplente.nombre if suplente else None,
        "motivo": solicitud.motivo,
        "estado": solicitud.estado,
        "respuesta": solicitud.respuesta,
        "revisada_por": revisor.nombre if revisor else None,
        "creada_en": solicitud.creada_en,
        "revisada_en": solicitud.revisada_en,
    }


@router.post("/solicitudes", status_code=201)
def crear_solicitud(
    datos: SolicitudInput,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):
    if datos.usuario_id != actor.id:
        raise HTTPException(status_code=403, detail="Solo puedes crear solicitudes para tu usuario.")
    solicitante = actor
    tipo = datos.tipo.strip().upper()
    motivo = datos.motivo.strip()
    if tipo not in TIPOS_SOLICITUD:
        raise HTTPException(status_code=400, detail="El tipo de solicitud no es válido.")
    if not motivo:
        raise HTTPException(status_code=400, detail="Escribe el motivo de la solicitud.")
    modalidad = datos.modalidad.strip().upper() if datos.modalidad else None
    if tipo == "CAMBIO_MODALIDAD" and modalidad not in MODALIDADES:
        raise HTTPException(status_code=400, detail="Selecciona CASA u OFICINA.")
    if tipo == "REEMPLAZO":
        if not datos.suplente_id:
            raise HTTPException(status_code=400, detail="Selecciona una persona suplente.")
        suplente = db.query(Suplente).filter(Suplente.id == datos.suplente_id).first()
        if not suplente:
            raise HTTPException(status_code=404, detail="La persona suplente no existe.")
    if tipo == "AUSENCIA" and datos.suplente_id:
        raise HTTPException(status_code=400, detail="Una ausencia no debe incluir suplente.")

    solicitud = Solicitud(
        usuario_id=solicitante.id,
        tipo=tipo,
        fecha=datos.fecha,
        modalidad=modalidad if tipo == "CAMBIO_MODALIDAD" else None,
        suplente_id=datos.suplente_id if tipo == "REEMPLAZO" else None,
        motivo=motivo,
    )
    db.add(solicitud)
    db.flush()
    revisores = db.query(Usuario).filter(
        Usuario.activo.is_(True),
        Usuario.rol.in_(["ADMIN", "LIDER"]),
    ).all()
    for revisor in revisores:
        notificar(
            db,
            revisor.id,
            f"{solicitante.nombre} envió una solicitud de {tipo.lower().replace('_', ' ')} para {datos.fecha}.",
        )
    auditar(
        db,
        solicitante,
        "CREAR",
        "solicitud",
        solicitud.id,
        f"Solicitud {tipo} para {datos.fecha}.",
    )
    db.commit()
    db.refresh(solicitud)
    return solicitud_dict(db, solicitud)


@router.get("/solicitudes")
def listar_solicitudes(
    usuario_id: int,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):
    if usuario_id != actor.id:
        raise HTTPException(status_code=403, detail="No puedes consultar solicitudes de otra persona.")
    usuario = actor
    consulta = db.query(Solicitud)
    if (usuario.rol or "").upper() not in {"ADMIN", "LIDER"}:
        consulta = consulta.filter(Solicitud.usuario_id == usuario.id)
    return [
        solicitud_dict(db, solicitud)
        for solicitud in consulta.order_by(Solicitud.creada_en.desc()).all()
    ]


@router.post("/solicitudes/{solicitud_id}/resolver")
def resolver_solicitud(
    solicitud_id: int,
    datos: ResolucionInput,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):
    if datos.revisor_id != actor.id:
        raise HTTPException(status_code=403, detail="La identidad del revisor no coincide con la sesión.")
    revisor = verificar_rol(db, actor.id, {"ADMIN", "LIDER"})
    solicitud = db.query(Solicitud).filter(Solicitud.id == solicitud_id).with_for_update().first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")
    if solicitud.estado != "PENDIENTE":
        raise HTTPException(status_code=409, detail="La solicitud ya fue resuelta.")
    solicitante = usuario_activo(db, solicitud.usuario_id)
    if revisor.id == solicitante.id:
        raise HTTPException(status_code=403, detail="No puedes aprobar tu propia solicitud.")

    respuesta = (datos.respuesta or "").strip() or None
    if datos.aprobar:
        if solicitud.tipo == "CAMBIO_MODALIDAD":
            asistencia = (
                db.query(Asistencia)
                .filter(
                    Asistencia.usuario_id == solicitud.usuario_id,
                    Asistencia.fecha == solicitud.fecha,
                )
                .first()
            )
            validar_cambio_asistencia(db, solicitud, asistencia)
            if asistencia:
                asistencia.modalidad = solicitud.modalidad
            else:
                db.add(
                    Asistencia(
                        usuario_id=solicitud.usuario_id,
                        fecha=solicitud.fecha,
                        modalidad=solicitud.modalidad,
                    )
                )
        elif solicitud.tipo == "AUSENCIA":
            db.query(Asistencia).filter(
                Asistencia.usuario_id == solicitud.usuario_id,
                Asistencia.fecha == solicitud.fecha,
            ).delete(synchronize_session=False)
        elif solicitud.tipo == "REEMPLAZO":
            suplente = db.query(Suplente).filter(Suplente.id == solicitud.suplente_id).first()
            if not suplente:
                raise HTTPException(status_code=404, detail="La persona suplente ya no existe.")
            if solicitud.fecha.weekday() >= 5:
                raise HTTPException(status_code=400, detail="No se registran reemplazos en fines de semana.")
            if db.query(Festivo.id).filter(Festivo.fecha == solicitud.fecha).first() or en_cierre(
                db, solicitud.fecha
            ):
                raise HTTPException(status_code=400, detail="La fecha es festivo o la oficina está cerrada.")
            asistencia = db.query(Asistencia).filter(
                Asistencia.usuario_id == solicitud.usuario_id,
                Asistencia.fecha == solicitud.fecha,
            ).first()
            if asistencia and asistencia.modalidad == "CASA":
                raise HTTPException(status_code=409, detail="Ese usuario está asignado en CASA.")
            if db.query(Reemplazo.id).filter(
                Reemplazo.usuario_id == solicitud.usuario_id,
                Reemplazo.fecha == solicitud.fecha,
            ).first():
                raise HTTPException(status_code=409, detail="Ese usuario ya tiene reemplazo ese día.")
            if db.query(Reemplazo.id).filter(
                Reemplazo.suplente_id == solicitud.suplente_id,
                Reemplazo.fecha == solicitud.fecha,
            ).first():
                raise HTTPException(status_code=409, detail="La persona suplente ya está ocupada ese día.")
            db.add(
                Reemplazo(
                    fecha=solicitud.fecha,
                    usuario_id=solicitud.usuario_id,
                    suplente_id=solicitud.suplente_id,
                    motivo=solicitud.motivo,
                )
            )
        solicitud.estado = "APROBADA"
    else:
        solicitud.estado = "RECHAZADA"

    solicitud.respuesta = respuesta
    solicitud.revisada_por_id = revisor.id
    solicitud.revisada_en = datetime.now(timezone.utc)
    estado = "aprobada" if datos.aprobar else "rechazada"
    notificar(
        db,
        solicitante.id,
        f"Tu solicitud del {solicitud.fecha} fue {estado}."
        + (f" Respuesta: {respuesta}" if respuesta else ""),
    )
    auditar(
        db,
        revisor,
        estado.upper(),
        "solicitud",
        solicitud.id,
        f"Solicitud {solicitud.tipo} del {solicitante.nombre} {estado}.",
    )
    db.commit()
    db.refresh(solicitud)
    return solicitud_dict(db, solicitud)


@router.get("/notificaciones")
def listar_notificaciones(
    usuario_id: int,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):
    if usuario_id != actor.id:
        raise HTTPException(status_code=403, detail="No puedes ver las notificaciones de otra persona.")
    notificaciones = (
        db.query(Notificacion)
        .filter(Notificacion.usuario_id == usuario_id)
        .order_by(Notificacion.creada_en.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": aviso.id,
            "mensaje": aviso.mensaje,
            "leida": aviso.leida,
            "creada_en": aviso.creada_en,
        }
        for aviso in notificaciones
    ]


@router.post("/notificaciones/{notificacion_id}/leer")
def marcar_notificacion_leida(
    notificacion_id: int,
    usuario_id: int,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):
    if usuario_id != actor.id:
        raise HTTPException(status_code=403, detail="No puedes modificar notificaciones de otra persona.")
    aviso = db.query(Notificacion).filter(
        Notificacion.id == notificacion_id,
        Notificacion.usuario_id == usuario_id,
    ).first()
    if not aviso:
        raise HTTPException(status_code=404, detail="Notificación no encontrada.")
    aviso.leida = True
    db.commit()
    return {"mensaje": "Notificación marcada como leída."}


@router.post("/notificaciones/leer-todas")
def marcar_todas_leidas(
    usuario_id: int,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):
    if usuario_id != actor.id:
        raise HTTPException(status_code=403, detail="No puedes modificar notificaciones de otra persona.")
    actualizadas = (
        db.query(Notificacion)
        .filter(Notificacion.usuario_id == usuario_id, Notificacion.leida.is_(False))
        .update({Notificacion.leida: True}, synchronize_session=False)
    )
    db.commit()
    return {"actualizadas": actualizadas}


@router.get("/auditoria")
def listar_auditoria(
    usuario_id: int,
    entidad: str | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):
    if usuario_id != actor.id:
        raise HTTPException(status_code=403, detail="La identidad no coincide con la sesión.")
    verificar_rol(db, actor.id, {"ADMIN", "LIDER"})
    consulta = db.query(Auditoria)
    if entidad:
        consulta = consulta.filter(Auditoria.entidad == entidad)
    if desde:
        consulta = consulta.filter(
            Auditoria.creada_en
            >= datetime.combine(desde, datetime.min.time(), tzinfo=timezone.utc)
        )
    if hasta:
        consulta = consulta.filter(
            Auditoria.creada_en
            < datetime.combine(hasta + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
        )
    eventos = consulta.order_by(Auditoria.creada_en.desc()).limit(500).all()
    resultados = []

    for evento in eventos:
        fecha_evento = evento.creada_en
        if fecha_evento.tzinfo is None:
            fecha_evento = fecha_evento.replace(tzinfo=timezone.utc)
        resultados.append(
            (
                fecha_evento,
                {
                    "id": f"auditoria-{evento.id}",
                    "actor": evento.actor_nombre,
                    "accion": evento.accion,
                    "entidad": evento.entidad,
                    "entidad_id": evento.entidad_id,
                    "detalle": evento.detalle,
                    "creada_en": evento.creada_en,
                    "fecha_es_actividad": False,
                },
            )
        )

    if not entidad or entidad == "asistencia":
        asistencias = db.query(Asistencia, Usuario.nombre).join(
            Usuario, Usuario.id == Asistencia.usuario_id
        )
        if desde:
            asistencias = asistencias.filter(Asistencia.fecha >= desde)
        if hasta:
            asistencias = asistencias.filter(Asistencia.fecha <= hasta)

        for asistencia, nombre in asistencias.order_by(Asistencia.fecha.desc()).limit(500).all():
            resultados.append(
                (
                    datetime.combine(
                        asistencia.fecha, datetime.min.time(), tzinfo=timezone.utc
                    ),
                    {
                        "id": f"asistencia-vigente-{asistencia.id}",
                        "actor": "No registrado",
                        "accion": "VIGENTE",
                        "entidad": "asistencia",
                        "entidad_id": asistencia.id,
                        "detalle": (
                            f"Asignación actual de {nombre}: {asistencia.modalidad} "
                            f"para el {asistencia.fecha}. No se conserva quién ni cuándo "
                            "registró originalmente esta asistencia."
                        ),
                        "creada_en": asistencia.fecha.isoformat(),
                        "fecha_es_actividad": True,
                    },
                )
            )

    resultados.sort(key=lambda resultado: resultado[0], reverse=True)
    return [evento for _, evento in resultados[:500]]


@router.get("/cierres")
def listar_cierres(db: Session = Depends(get_db), actor: Usuario = Depends(usuario_actual)):
    usuario_activo(db, actor.id)
    cierres = db.query(CierreOficina).order_by(CierreOficina.fecha_inicio).all()
    return [
        {
            "id": cierre.id,
            "fecha_inicio": cierre.fecha_inicio,
            "fecha_fin": cierre.fecha_fin,
            "descripcion": cierre.descripcion,
        }
        for cierre in cierres
    ]


@router.post("/cierres", status_code=201)
def crear_cierre(
    datos: CierreInput,
    db: Session = Depends(get_db),
    usuario_sesion: Usuario = Depends(usuario_actual),
):
    if datos.actor_id != usuario_sesion.id:
        raise HTTPException(status_code=403, detail="La identidad no coincide con la sesión.")
    actor = verificar_rol(db, usuario_sesion.id, {"ADMIN"})
    descripcion = datos.descripcion.strip()
    if datos.fecha_fin < datos.fecha_inicio:
        raise HTTPException(status_code=400, detail="La fecha final debe ser igual o posterior a la inicial.")
    if not descripcion:
        raise HTTPException(status_code=400, detail="La descripción del cierre no puede estar vacía.")
    repetido = db.query(CierreOficina.id).filter(
        CierreOficina.fecha_inicio <= datos.fecha_fin,
        CierreOficina.fecha_fin >= datos.fecha_inicio,
    ).first()
    if repetido:
        raise HTTPException(status_code=409, detail="El rango coincide con otro cierre de oficina.")
    cierre = CierreOficina(
        fecha_inicio=datos.fecha_inicio,
        fecha_fin=datos.fecha_fin,
        descripcion=descripcion,
    )
    db.add(cierre)
    db.flush()
    auditar(db, actor, "CREAR", "cierre", cierre.id, f"Cierre: {descripcion}.")
    db.add_all(
        Notificacion(
            usuario_id=usuario.id,
            mensaje=f"Se registró un cierre de oficina: {descripcion} ({datos.fecha_inicio} al {datos.fecha_fin}).",
        )
        for usuario in db.query(Usuario).filter(Usuario.activo.is_(True)).all()
        if usuario.id != actor.id
    )
    db.commit()
    db.refresh(cierre)
    return {
        "id": cierre.id,
        "fecha_inicio": cierre.fecha_inicio,
        "fecha_fin": cierre.fecha_fin,
        "descripcion": cierre.descripcion,
    }


@router.delete("/cierres/{cierre_id}")
def eliminar_cierre(
    cierre_id: int,
    actor_id: int,
    db: Session = Depends(get_db),
    usuario_sesion: Usuario = Depends(usuario_actual),
):
    if actor_id != usuario_sesion.id:
        raise HTTPException(status_code=403, detail="La identidad no coincide con la sesión.")
    actor = verificar_rol(db, usuario_sesion.id, {"ADMIN"})
    cierre = db.query(CierreOficina).filter(CierreOficina.id == cierre_id).first()
    if not cierre:
        raise HTTPException(status_code=404, detail="Cierre de oficina no encontrado.")
    auditar(
        db,
        actor,
        "ELIMINAR",
        "cierre",
        cierre.id,
        f"Cierre eliminado: {cierre.descripcion} ({cierre.fecha_inicio} al {cierre.fecha_fin}).",
    )
    db.add_all(
        Notificacion(
            usuario_id=usuario.id,
            mensaje=f"Se eliminó un cierre de oficina: {cierre.descripcion}.",
        )
        for usuario in db.query(Usuario).filter(Usuario.activo.is_(True)).all()
        if usuario.id != actor.id
    )
    db.delete(cierre)
    db.commit()
    return {"mensaje": "Cierre de oficina eliminado."}


@router.get("/reportes/asistencias")
def reporte_asistencias(
    usuario_id: int,
    desde: date | None = None,
    hasta: date | None = None,
    persona_id: int | None = None,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):
    if usuario_id != actor.id:
        raise HTTPException(status_code=403, detail="La identidad no coincide con la sesión.")
    verificar_rol(db, actor.id, {"ADMIN", "LIDER"})
    if desde and hasta and hasta < desde:
        raise HTTPException(status_code=400, detail="La fecha final debe ser posterior a la inicial.")
    consulta = (
        db.query(Asistencia, Usuario.nombre)
        .join(Usuario, Usuario.id == Asistencia.usuario_id)
    )
    if desde:
        consulta = consulta.filter(Asistencia.fecha >= desde)
    if hasta:
        consulta = consulta.filter(Asistencia.fecha <= hasta)
    if persona_id:
        consulta = consulta.filter(Asistencia.usuario_id == persona_id)
    filas = consulta.order_by(Asistencia.fecha, Usuario.nombre).all()
    return [
        {
            "id": asistencia.id,
            "usuario_id": asistencia.usuario_id,
            "usuario": nombre,
            "fecha": asistencia.fecha,
            "modalidad": asistencia.modalidad,
        }
        for asistencia, nombre in filas
    ]


@router.get("/panel-lider")
def panel_lider(
    usuario_id: int,
    fecha: date | None = None,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):
    if usuario_id != actor.id:
        raise HTTPException(status_code=403, detail="La identidad no coincide con la sesión.")
    verificar_rol(db, actor.id, {"ADMIN", "LIDER"})
    fecha_consulta = fecha or date.today()
    asignaciones = (
        db.query(Asistencia, Usuario.nombre)
        .join(Usuario, Usuario.id == Asistencia.usuario_id)
        .filter(Asistencia.fecha == fecha_consulta)
        .order_by(Usuario.nombre)
        .all()
    )
    reemplazos = (
        db.query(Reemplazo, Usuario.nombre, Suplente.nombre)
        .join(Usuario, Usuario.id == Reemplazo.usuario_id)
        .join(Suplente, Suplente.id == Reemplazo.suplente_id)
        .filter(Reemplazo.fecha == fecha_consulta)
        .all()
    )
    usuarios_reemplazados = {reemplazo.usuario_id for reemplazo, _, _ in reemplazos}
    personas = [
        {
            "clave": f"usuario-{asistencia.usuario_id}",
            "usuario_id": asistencia.usuario_id,
            "usuario": nombre,
            "modalidad": asistencia.modalidad,
            "reemplazo_de": None,
        }
        for asistencia, nombre in asignaciones
        if asistencia.usuario_id not in usuarios_reemplazados
    ]
    personas.extend(
        {
            "clave": f"reemplazo-{reemplazo.id}",
            "usuario_id": None,
            "usuario": nombre_suplente,
            "modalidad": "OFICINA",
            "reemplazo_de": nombre_reemplazado,
        }
        for reemplazo, nombre_reemplazado, nombre_suplente in reemplazos
    )
    personas.sort(key=lambda persona: persona["usuario"].casefold())
    pendientes = db.query(Solicitud).filter(Solicitud.estado == "PENDIENTE").count()
    return {
        "fecha": fecha_consulta,
        "total": len(personas),
        "casa": sum(persona["modalidad"] == "CASA" for persona in personas),
        "oficina": sum(persona["modalidad"] == "OFICINA" for persona in personas),
        "pendientes": pendientes,
        "asistencias": personas,
    }
