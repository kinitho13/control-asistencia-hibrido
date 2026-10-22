from sqlalchemy import create_engine

DATABASE_URL = "postgresql+psycopg2://admin:admin123@localhost:5432/asistencia"

engine = create_engine(DATABASE_URL)
