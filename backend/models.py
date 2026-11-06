from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)


class Base(DeclarativeBase):
    pass


class Usuario(Base):

    __tablename__ = "usuarios"

    id = Column(
        Integer,
        primary_key=True
    )

    nombre = Column(
        String(150),
        nullable=False
    )

    usuario = Column(
        String(100),
        unique=True
    )

    password = Column(
        String(255),
        nullable=False
    )

    rol = Column(
        String(50),
        default="USUARIO"
    )

    activo = Column(
        Boolean,
        default=True
    )

class Restriccion(Base):
    __tablename__ = "restricciones"

    id = Column(Integer, primary_key=True)

    usuario1_id = Column(Integer, ForeignKey("usuarios.id"))
    usuario2_id = Column(Integer, ForeignKey("usuarios.id"))

    __table_args__ = (
        UniqueConstraint("usuario1_id", "usuario2_id", name="uq_restriccion_usuarios"),
    )


class Asistencia(Base):
    __tablename__ = "asistencias"

    id = Column(Integer, primary_key=True)

    usuario_id = Column(Integer, ForeignKey("usuarios.id"))

    fecha = Column(Date)

    modalidad = Column(String(20))


class RegistroAsistencia(Base):
    __tablename__ = "registros_asistencia"
    __table_args__ = (
        UniqueConstraint("usuario_id", "fecha", name="uq_registro_asistencia_usuario_fecha"),
    )

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    fecha = Column(Date, nullable=False, index=True)
    estado = Column(String(20), nullable=False, default="PRESENTE")
    modalidad = Column(String(20), nullable=True)
    entrada = Column(DateTime(timezone=True), nullable=True)
    salida = Column(DateTime(timezone=True), nullable=True)
    motivo = Column(Text, nullable=True)
    actualizado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    actualizado_en = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Festivo(Base):
    __tablename__ = "festivos"

    id = Column(Integer, primary_key=True)

    fecha = Column(Date)

    descripcion = Column(String(100))

class Suplente(Base):

    __tablename__ = "suplentes"

    id = Column(
        Integer,
        primary_key=True
    )

    nombre = Column(
        String(150),
        nullable=False,
        unique=True
    )
class Reemplazo(Base):
    __tablename__ = "reemplazos"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, nullable=False, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    suplente_id = Column(Integer, ForeignKey("suplentes.id", ondelete="CASCADE"), nullable=False)
    motivo = Column(String, nullable=True)


class Solicitud(Base):
    __tablename__ = "solicitudes"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    tipo = Column(String(30), nullable=False)
    fecha = Column(Date, nullable=False, index=True)
    modalidad = Column(String(20), nullable=True)
    suplente_id = Column(Integer, nullable=True)
    motivo = Column(Text, nullable=False)
    estado = Column(String(20), nullable=False, default="PENDIENTE", index=True)
    respuesta = Column(Text, nullable=True)
    revisada_por_id = Column(Integer, nullable=True)
    creada_en = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    revisada_en = Column(DateTime(timezone=True), nullable=True)


class Notificacion(Base):
    __tablename__ = "notificaciones"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    mensaje = Column(Text, nullable=False)
    leida = Column(Boolean, nullable=False, default=False, index=True)
    creada_en = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Auditoria(Base):
    __tablename__ = "auditoria"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, nullable=True)
    actor_nombre = Column(String(150), nullable=False, default="Sistema")
    accion = Column(String(40), nullable=False)
    entidad = Column(String(60), nullable=False, index=True)
    entidad_id = Column(Integer, nullable=True)
    detalle = Column(Text, nullable=False)
    creada_en = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class CierreOficina(Base):
    __tablename__ = "cierres_oficina"

    id = Column(Integer, primary_key=True, index=True)
    fecha_inicio = Column(Date, nullable=False, index=True)
    fecha_fin = Column(Date, nullable=False, index=True)
    descripcion = Column(String(200), nullable=False)


class SesionAcceso(Base):
    __tablename__ = "sesiones_acceso"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expira_en = Column(DateTime(timezone=True), nullable=False, index=True)
