"""
Reemplazos: una persona que NO es usuario habitual cubre a un usuario que no viene.

Rutas:
  /suplentes   -> personas externas que pueden reemplazar (crear, listar, renombrar, borrar)
  /reemplazos  -> "el usuario X no viene el día D y viene la persona Y" (crear, listar, editar, borrar)
"""
import calendar
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, sessionmaker

from database import engine
from auth import usuario_actual, usuario_actual_opcional
from models import (
    Asistencia,
    Auditoria,
    CierreOficina,
    Festivo,
    Notificacion,
    Reemplazo,
    Suplente,
    Usuario,
)

router = APIRouter(tags=["reemplazos"])
SessionLocal = sessionmaker(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def usuario_o_404(db: Session, usuario_id: int) -> Usuario:
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail=f"El usuario {usuario_id} no existe.")
    return usuario


def suplente_o_404(db: Session, suplente_id: int) -> Suplente:
    suplente = db.query(Suplente).filter(Suplente.id == suplente_id).first()
    if not suplente:
        raise HTTPException(status_code=404, detail="Esa persona no está registrada.")
    return suplente


def validar_nombre_suplente(db: Session, nombre: str, excluir_id: int | None = None) -> str:
    nombre = nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío.")

    if db.query(Usuario).filter(func.lower(Usuario.nombre) == nombre.lower()).first():
        raise HTTPException(status_code=409, detail="Esa persona ya es un usuario habitual.")

    consulta = db.query(Suplente).filter(func.lower(Suplente.nombre) == nombre.lower())
    if excluir_id is not None:
        consulta = consulta.filter(Suplente.id != excluir_id)
    if consulta.first():
        raise HTTPException(status_code=409, detail="Ya existe una persona con ese nombre.")

    return nombre


def limpiar_motivo(motivo: str | None) -> str | None:
    motivo = (motivo or "").strip()
    return motivo or None


def oficina_cerrada(db: Session, fecha: date) -> bool:
    return (
        db.query(CierreOficina.id)
        .filter(CierreOficina.fecha_inicio <= fecha, CierreOficina.fecha_fin >= fecha)
        .first()
        is not None
    )


def validar_actor(
    db: Session, actor_id: int | None, sesion: Usuario | None
) -> Usuario | None:
    if actor_id is None:
        return None
    if not sesion:
        raise HTTPException(status_code=401, detail="Inicia sesión para registrar el responsable del cambio.")
    if actor_id != sesion.id:
        raise HTTPException(status_code=403, detail="El responsable no coincide con la sesión.")
    return db.query(Usuario).filter(Usuario.id == sesion.id).first()


def auditar_reemplazo(
    db: Session,
    actor: Usuario | None,
    accion: str,
    reemplazo: Reemplazo,
    detalle: str,
) -> None:
    db.add(
        Auditoria(
            actor_id=actor.id if actor else None,
            actor_nombre=actor.nombre if actor else "Sistema",
            accion=accion,
            entidad="reemplazo",
            entidad_id=reemplazo.id,
            detalle=detalle,
        )
    )


def reemplazos_con_nombres(db: Session, inicio: date | None = None, fin: date | None = None) -> list[dict]:
    consulta = (
        db.query(
            Reemplazo.id,
            Reemplazo.fecha,
            Reemplazo.usuario_id,
            Usuario.nombre.label("usuario"),
            Reemplazo.suplente_id,
            Suplente.nombre.label("suplente"),
            Reemplazo.motivo,
        )
        .join(Usuario, Usuario.id == Reemplazo.usuario_id)
        .join(Suplente, Suplente.id == Reemplazo.suplente_id)
    )
    if inicio and fin:
        consulta = consulta.filter(Reemplazo.fecha >= inicio, Reemplazo.fecha <= fin)

    filas = consulta.order_by(Reemplazo.fecha, Usuario.nombre).all()
    return [
        {
            "id": f.id,
            "fecha": f.fecha,
            "usuario_id": f.usuario_id,
            "usuario": f.usuario,
            "suplente_id": f.suplente_id,
            "suplente": f.suplente,
            "motivo": f.motivo,
        }
        for f in filas
    ]


# ---------------------------------------------------------------------------
# Reemplazos
# ---------------------------------------------------------------------------
@router.post("/reemplazos", status_code=201)
def crear_reemplazo(
    fecha: date,
    usuario_id: int,
    suplente_id: int,
    motivo: str | None = None,
    actor_id: int | None = None,
    db: Session = Depends(get_db),
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
):
    actor = validar_actor(db, actor_id, usuario_sesion)
    usuario_o_404(db, usuario_id)
    suplente_o_404(db, suplente_id)

    if fecha.weekday() >= 5:
        raise HTTPException(status_code=400, detail="No se registran reemplazos en fines de semana.")

    if db.query(Festivo).filter(Festivo.fecha == fecha).first() or oficina_cerrada(db, fecha):
        raise HTTPException(status_code=400, detail="Esa fecha es festivo o la oficina está cerrada.")

    asistencia = db.query(Asistencia).filter(
        Asistencia.usuario_id == usuario_id, Asistencia.fecha == fecha
    ).first()
    if asistencia and asistencia.modalidad == "CASA":
        raise HTTPException(
            status_code=409,
            detail="Ese usuario está en CASA ese día, así que no necesita reemplazo.",
        )

    if db.query(Reemplazo).filter(
        Reemplazo.usuario_id == usuario_id, Reemplazo.fecha == fecha
    ).first():
        raise HTTPException(status_code=409, detail="Ese usuario ya tiene un reemplazo ese día.")

    if db.query(Reemplazo).filter(
        Reemplazo.suplente_id == suplente_id, Reemplazo.fecha == fecha
    ).first():
        raise HTTPException(
            status_code=409, detail="Esa persona ya está reemplazando a otro usuario ese día."
        )

    reemplazo = Reemplazo(
        fecha=fecha,
        usuario_id=usuario_id,
        suplente_id=suplente_id,
        motivo=limpiar_motivo(motivo),
    )
    db.add(reemplazo)
    db.flush()
    auditar_reemplazo(
        db,
        actor,
        "CREAR",
        reemplazo,
        f"Registró reemplazo para usuario {usuario_id} el {fecha}.",
    )
    db.add(
        Notificacion(
            usuario_id=usuario_id,
            mensaje=f"Se registró un reemplazo para tu jornada del {fecha}.",
        )
    )
    db.commit()
    db.refresh(reemplazo)

    return {
        "id": reemplazo.id,
        "fecha": reemplazo.fecha,
        "usuario_id": usuario_id,
        "suplente_id": suplente_id,
        "motivo": reemplazo.motivo,
    }


@router.get("/reemplazos")
def listar_reemplazos(
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
):
    """Sin filtros devuelve todos; con anio y mes, solo los de ese mes."""
    if anio is not None and mes is not None:
        if not 1 <= mes <= 12:
            raise HTTPException(status_code=400, detail="El mes debe estar entre 1 y 12.")
        inicio = date(anio, mes, 1)
        fin = date(anio, mes, calendar.monthrange(anio, mes)[1])
        return reemplazos_con_nombres(db, inicio, fin)

    return reemplazos_con_nombres(db)


@router.put("/reemplazos/{reemplazo_id}")
def editar_reemplazo(
    reemplazo_id: int,
    suplente_id: int,
    motivo: str | None = None,
    actor_id: int | None = None,
    db: Session = Depends(get_db),
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
):
    """Cambia quién reemplaza o el motivo. Para cambiar fecha o usuario, borra y crea de nuevo."""
    actor = validar_actor(db, actor_id, usuario_sesion)
    reemplazo = db.query(Reemplazo).filter(Reemplazo.id == reemplazo_id).first()
    if not reemplazo:
        raise HTTPException(status_code=404, detail="Reemplazo no encontrado.")

    suplente_o_404(db, suplente_id)

    ocupado = db.query(Reemplazo).filter(
        Reemplazo.suplente_id == suplente_id,
        Reemplazo.fecha == reemplazo.fecha,
        Reemplazo.id != reemplazo_id,
    ).first()
    if ocupado:
        raise HTTPException(
            status_code=409, detail="Esa persona ya está reemplazando a otro usuario ese día."
        )

    suplente_anterior_id = reemplazo.suplente_id
    reemplazo.suplente_id = suplente_id
    reemplazo.motivo = limpiar_motivo(motivo)
    auditar_reemplazo(
        db,
        actor,
        "EDITAR",
        reemplazo,
        f"Actualizó el reemplazo del {reemplazo.fecha}; suplente {suplente_anterior_id} → {suplente_id}.",
    )
    db.add(
        Notificacion(
            usuario_id=reemplazo.usuario_id,
            mensaje=f"Se actualizó el reemplazo de tu jornada del {reemplazo.fecha}.",
        )
    )
    db.commit()
    db.refresh(reemplazo)

    return {
        "id": reemplazo.id,
        "fecha": reemplazo.fecha,
        "usuario_id": reemplazo.usuario_id,
        "suplente_id": reemplazo.suplente_id,
        "motivo": reemplazo.motivo,
    }


@router.delete("/reemplazos/{reemplazo_id}")
def eliminar_reemplazo(
    reemplazo_id: int,
    actor_id: int | None = None,
    db: Session = Depends(get_db),
    usuario_sesion: Usuario | None = Depends(usuario_actual_opcional),
):
    actor = validar_actor(db, actor_id, usuario_sesion)
    reemplazo = db.query(Reemplazo).filter(Reemplazo.id == reemplazo_id).first()
    if not reemplazo:
        raise HTTPException(status_code=404, detail="Reemplazo no encontrado.")

    auditar_reemplazo(
        db,
        actor,
        "ELIMINAR",
        reemplazo,
        f"Eliminó el reemplazo del {reemplazo.fecha} para usuario {reemplazo.usuario_id}.",
    )
    db.add(
        Notificacion(
            usuario_id=reemplazo.usuario_id,
            mensaje=f"Se eliminó el reemplazo de tu jornada del {reemplazo.fecha}.",
        )
    )
    db.delete(reemplazo)
    db.commit()
    return {"mensaje": "Reemplazo eliminado"}


@router.post("/suplentes")
def crear_suplente(
    nombre: str,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):

    nombre = nombre.strip()

    if not nombre:
        raise HTTPException(
            status_code=400,
            detail="El nombre no puede estar vacío."
        )

    existe = db.query(Suplente).filter(
        func.lower(Suplente.nombre) == nombre.lower()
    ).first()

    if existe:
        raise HTTPException(
            status_code=409,
            detail="Esa persona ya existe."
        )

    suplente = Suplente(
        nombre=nombre
    )

    db.add(suplente)

    db.commit()

    db.refresh(suplente)

    return suplente

@router.get("/suplentes")
def listar_suplentes(
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):

    suplentes = db.query(
        Suplente
    ).order_by(
        Suplente.nombre
    ).all()

    return suplentes

@router.put("/suplentes/{suplente_id}")
def editar_suplente(
    suplente_id: int,
    nombre: str,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):

    suplente = db.query(
        Suplente
    ).filter(
        Suplente.id == suplente_id
    ).first()

    if not suplente:

        raise HTTPException(
            status_code=404,
            detail="Suplente no encontrado."
        )

    suplente.nombre = nombre

    db.commit()

    db.refresh(suplente)

    return suplente

@router.delete("/suplentes/{suplente_id}")
def eliminar_suplente(
    suplente_id: int,
    db: Session = Depends(get_db),
    actor: Usuario = Depends(usuario_actual),
):

    suplente = db.query(
        Suplente
    ).filter(
        Suplente.id == suplente_id
    ).first()

    if not suplente:

        raise HTTPException(
            status_code=404,
            detail="Suplente no encontrado."
        )

    db.delete(suplente)

    db.commit()

    return {
        "mensaje": "Suplente eliminado"
    }
@router.get("/reemplazos/todos")
def listar_todos_reemplazos(
    db: Session = Depends(get_db)
):
    return reemplazos_con_nombres(db)
