from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import (Column,Integer,String,Date,Boolean,ForeignKey)


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
        String(255)
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


class Asistencia(Base):
    __tablename__ = "asistencias"

    id = Column(Integer, primary_key=True)

    usuario_id = Column(Integer, ForeignKey("usuarios.id"))

    fecha = Column(Date)

    modalidad = Column(String(20))

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