import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session, sessionmaker

from database import engine
from models import SesionAcceso, Usuario

router = APIRouter(tags=["sesion"])
SessionLocal = sessionmaker(bind=engine)
DURACION_SESION = timedelta(hours=8)
ITERACIONES_PASSWORD = 310_000


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    sal = secrets.token_bytes(16)
    derivada = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), sal, ITERACIONES_PASSWORD)
    return "$".join(
        (
            "pbkdf2_sha256",
            str(ITERACIONES_PASSWORD),
            base64.urlsafe_b64encode(sal).decode("ascii"),
            base64.urlsafe_b64encode(derivada).decode("ascii"),
        )
    )


def verificar_password(password: str, guardada: str | None) -> bool:
    if not guardada:
        return False
    try:
        algoritmo, iteraciones, sal, esperada = guardada.split("$", 3)
        if algoritmo != "pbkdf2_sha256":
            return False
        derivada = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            base64.urlsafe_b64decode(sal.encode("ascii")),
            int(iteraciones),
        )
        return hmac.compare_digest(
            derivada, base64.urlsafe_b64decode(esperada.encode("ascii"))
        )
    except (ValueError, TypeError):
        return False


def buscar_usuario_login(db: Session, identificador: str) -> Usuario | None:
    return (
        db.query(Usuario)
        .filter(func.lower(Usuario.usuario) == identificador.strip().lower())
        .first()
    )


def crear_sesion(db: Session, usuario: Usuario) -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        SesionAcceso(
            usuario_id=usuario.id,
            token_hash=hash_token(token),
            expira_en=datetime.now(timezone.utc) + DURACION_SESION,
        )
    )
    return token


def usuario_actual_opcional(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Usuario | None:
    if not authorization:
        return None
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Inicia sesión para continuar.")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="La sesión no es válida.")

    sesion = (
        db.query(SesionAcceso)
        .filter(SesionAcceso.token_hash == hash_token(token))
        .first()
    )
    if not sesion:
        raise HTTPException(status_code=401, detail="La sesión no es válida o ya expiró.")
    expiracion = sesion.expira_en
    if expiracion.tzinfo is None:
        expiracion = expiracion.replace(tzinfo=timezone.utc)
    if expiracion <= datetime.now(timezone.utc):
        db.delete(sesion)
        db.commit()
        raise HTTPException(status_code=401, detail="Tu sesión expiró. Inicia sesión de nuevo.")

    usuario = db.query(Usuario).filter(
        Usuario.id == sesion.usuario_id,
        Usuario.activo.is_(True),
    ).first()
    if not usuario:
        raise HTTPException(status_code=403, detail="El usuario está inactivo.")
    return usuario


def validar_permisos(request: Request, usuario: Usuario | None) -> None:
    if request.url.path in {"/", "/login", "/crear-admin", "/logout"}:
        return
    if not usuario:
        raise HTTPException(status_code=401, detail="Inicia sesión para continuar.")

    ruta = request.url.path
    metodo = request.method.upper()
    es_escritura = metodo in {"POST", "PUT", "PATCH", "DELETE"}
    rol = (usuario.rol or "").upper()

    solo_admin = es_escritura and ruta.startswith(
        ("/usuarios", "/restricciones", "/festivos", "/cierres")
    )
    if solo_admin and rol != "ADMIN":
        raise HTTPException(status_code=403, detail="Se requiere el rol de administrador.")

    rutas_liderazgo = ("/asistencias", "/reemplazos", "/suplentes", "/generar-mes-v2")
    resolver_solicitud = ruta.startswith("/solicitudes/") and ruta.endswith("/resolver")
    if es_escritura and (
        ruta.startswith(rutas_liderazgo) or resolver_solicitud
    ) and rol not in {"ADMIN", "LIDER"}:
        raise HTTPException(status_code=403, detail="Se requiere el rol de líder o administrador.")


def proteger_operaciones(
    request: Request,
    usuario: Usuario | None = Depends(usuario_actual_opcional),
) -> None:
    validar_permisos(request, usuario)


def usuario_actual(usuario: Usuario | None = Depends(usuario_actual_opcional)) -> Usuario:
    if not usuario:
        raise HTTPException(status_code=401, detail="Inicia sesión para continuar.")
    return usuario


@router.post("/logout")
def cerrar_sesion(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if token:
            db.query(SesionAcceso).filter(
                SesionAcceso.token_hash == hash_token(token)
            ).delete(synchronize_session=False)
            db.commit()
    return {"mensaje": "Sesión cerrada."}
