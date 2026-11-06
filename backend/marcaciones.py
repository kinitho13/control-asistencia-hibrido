from datetime import date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, sessionmaker

from auth import usuario_actual
from database import engine
from gestiones import auditar, verificar_rol
from models import RegistroAsistencia, Usuario

router = APIRouter(tags=["marcaciones"])
SessionLocal = sessionmaker(bind=engine)
ZONA_HORARIA = ZoneInfo("America/Bogota")
MODALIDADES = {"CASA", "OFICINA"}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class EntradaInput(BaseModel):
    modalidad: Literal["CASA", "OFICINA"]


class RegistroEquipoInput(BaseModel):
    estado: Literal["PRESENTE", "AUSENTE"]
    modalidad: Literal["CASA", "OFICINA"] | None = None
    entrada: time | None = None
    salida: time | None = None
    motivo: str | None = Field(default=None, max_length=1000)


def ahora_local() -> datetime:
    return datetime.now(ZONA_HORARIA).replace(microsecond=0)


def registro_dict(registro: RegistroAsistencia, nombre: str | None = None) -> dict:
    def fecha_hora_iso(valor: datetime | None) -> str | None:
        if valor is None:
            return None
        if valor.tzinfo is None:
            valor = valor.replace(tzinfo=ZONA_HORARIA)
        return valor.astimezone(ZONA_HORARIA).isoformat()

    return {
        "id": registro.id,
        "usuario_id": registro.usuario_id,
        "usuario": nombre,
        "fecha": registro.fecha,
        "estado": registro.estado,
        "modalidad": registro.modalidad,
        "entrada": fecha_hora_iso(registro.entrada),
        "salida": fecha_hora_iso(registro.salida),
        "motivo": registro.motivo,
    }


def buscar_registro(db: Session, usuario_id: int, fecha: date) -> RegistroAsistencia | None:
    return (
        db.query(RegistroAsistencia)
        .filter(
            RegistroAsistencia.usuario_id == usuario_id,
            RegistroAsistencia.fecha == fecha,
        )
        .first()
    )


@router.get("/marcaciones/mias")
def listar_marcaciones_propias(
    desde: date | None = None,
    hasta: date | None = None,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):
    hoy = ahora_local().date()
    fecha_inicio = desde or hoy - timedelta(days=30)
    fecha_fin = hasta or hoy
    if fecha_fin < fecha_inicio:
        raise HTTPException(status_code=400, detail="La fecha final debe ser posterior a la inicial.")
    if (fecha_fin - fecha_inicio).days > 366:
        raise HTTPException(status_code=400, detail="El rango de consulta no puede superar un año.")

    registros = (
        db.query(RegistroAsistencia)
        .filter(
            RegistroAsistencia.usuario_id == actor.id,
            RegistroAsistencia.fecha >= fecha_inicio,
            RegistroAsistencia.fecha <= fecha_fin,
        )
        .order_by(RegistroAsistencia.fecha.desc())
        .all()
    )
    return [registro_dict(registro) for registro in registros]


@router.post("/marcaciones/entrada", status_code=201)
def marcar_entrada(
    datos: EntradaInput,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):
    hoy = ahora_local().date()
    registro = buscar_registro(db, actor.id, hoy)
    if registro and registro.estado == "AUSENTE":
        raise HTTPException(
            status_code=409,
            detail="Tu asistencia de hoy fue marcada como ausente. Solicita una corrección a tu líder.",
        )
    if registro and registro.entrada:
        raise HTTPException(status_code=409, detail="La entrada de hoy ya está registrada.")

    momento = ahora_local()
    if registro is None:
        registro = RegistroAsistencia(
            usuario_id=actor.id,
            fecha=hoy,
            estado="PRESENTE",
            modalidad=datos.modalidad,
            entrada=momento,
            actualizado_por_id=actor.id,
        )
        db.add(registro)
        db.flush()
    else:
        registro.estado = "PRESENTE"
        registro.modalidad = datos.modalidad
        registro.entrada = momento
        registro.actualizado_por_id = actor.id
        registro.actualizado_en = momento

    auditar(db, actor, "MARCAR_ENTRADA", "registro_asistencia", registro.id, f"Registró entrada del {hoy}.")
    db.commit()
    db.refresh(registro)
    return registro_dict(registro, actor.nombre)


@router.post("/marcaciones/salida")
def marcar_salida(
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):
    hoy = ahora_local().date()
    registro = buscar_registro(db, actor.id, hoy)
    if not registro or not registro.entrada or registro.estado != "PRESENTE":
        raise HTTPException(status_code=409, detail="Registra tu entrada antes de marcar la salida.")
    if registro.salida:
        raise HTTPException(status_code=409, detail="La salida de hoy ya está registrada.")

    registro.salida = ahora_local()
    registro.actualizado_por_id = actor.id
    registro.actualizado_en = ahora_local()
    auditar(db, actor, "MARCAR_SALIDA", "registro_asistencia", registro.id, f"Registró salida del {hoy}.")
    db.commit()
    db.refresh(registro)
    return registro_dict(registro, actor.nombre)


@router.get("/marcaciones/equipo")
def listar_marcaciones_equipo(
    fecha: date = Query(default_factory=lambda: ahora_local().date()),
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):
    verificar_rol(db, actor.id, {"ADMIN", "LIDER"})
    filas = (
        db.query(Usuario, RegistroAsistencia)
        .outerjoin(
            RegistroAsistencia,
            (RegistroAsistencia.usuario_id == Usuario.id)
            & (RegistroAsistencia.fecha == fecha),
        )
        .filter(Usuario.activo.is_(True))
        .order_by(Usuario.nombre)
        .all()
    )
    resultado = []
    for usuario, registro in filas:
        resultado.append(
            registro_dict(registro, usuario.nombre)
            if registro
            else {
                "id": None,
                "usuario_id": usuario.id,
                "usuario": usuario.nombre,
                "fecha": fecha,
                "estado": "SIN MARCAR",
                "modalidad": None,
                "entrada": None,
                "salida": None,
                "motivo": None,
            }
        )
    return resultado


@router.put("/marcaciones/equipo/{usuario_id}")
def guardar_marcacion_equipo(
    usuario_id: int,
    datos: RegistroEquipoInput,
    fecha: date,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):
    verificar_rol(db, actor.id, {"ADMIN", "LIDER"})
    usuario = (
        db.query(Usuario)
        .filter(Usuario.id == usuario_id, Usuario.activo.is_(True))
        .first()
    )
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario activo no encontrado.")
    if datos.estado == "PRESENTE" and datos.modalidad not in MODALIDADES:
        raise HTTPException(status_code=400, detail="Selecciona CASA u OFICINA para marcar presente.")
    if datos.estado == "AUSENTE" and (datos.entrada or datos.salida):
        raise HTTPException(status_code=400, detail="Una ausencia no puede incluir horas de entrada o salida.")
    if datos.salida and not datos.entrada:
        raise HTTPException(status_code=400, detail="Registra la hora de entrada antes de la salida.")
    if datos.entrada and datos.salida and datos.salida <= datos.entrada:
        raise HTTPException(status_code=400, detail="La hora de salida debe ser posterior a la entrada.")

    registro = buscar_registro(db, usuario_id, fecha)
    momento = ahora_local()
    if registro is None:
        registro = RegistroAsistencia(usuario_id=usuario_id, fecha=fecha)
        db.add(registro)

    registro.estado = datos.estado
    registro.modalidad = datos.modalidad if datos.estado == "PRESENTE" else None
    registro.entrada = (
        datetime.combine(fecha, datos.entrada, tzinfo=ZONA_HORARIA)
        if datos.entrada
        else momento if datos.estado == "PRESENTE" and fecha == momento.date() else None
    )
    registro.salida = (
        datetime.combine(fecha, datos.salida, tzinfo=ZONA_HORARIA)
        if datos.salida
        else None
    )
    registro.motivo = datos.motivo.strip() if datos.motivo and datos.motivo.strip() else None
    registro.actualizado_por_id = actor.id
    registro.actualizado_en = momento
    db.flush()

    auditar(
        db,
        actor,
        "REGISTRAR_ASISTENCIA",
        "registro_asistencia",
        registro.id,
        f"Registró a {usuario.nombre} como {datos.estado.lower()} el {fecha}.",
    )
    db.commit()
    db.refresh(registro)
    return registro_dict(registro, usuario.nombre)
