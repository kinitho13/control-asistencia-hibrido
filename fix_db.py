import os

from sqlalchemy import create_engine

DATABASE_URL = os.getenv(
    \ DATABASE_URL\,
    \postgresql+psycopg2://user:password@localhost:5432/asistencia\
)

if DATABASE_URL.startswith(\postgresql://\):
    DATABASE_URL = DATABASE_URL.replace(
        \postgresql://\,
        \postgresql+psycopg2://\,
        1
    )

# Configuración de pool de conexiones para producción
engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
)
