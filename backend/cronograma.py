"""
POST /cronograma/generar-mes-v2

Genera el cronograma CASA/OFICINA de un mes para TODOS los usuarios.

Estructura:
  - Configuración .................. constantes que gobiernan las reglas
  - Estado ......................... foto en memoria del mes (sin tocar la BD)
  - Algoritmo (funciones puras) .... planificar_semana / construir_cronograma
  - Endpoint ....................... lee la BD, ejecuta el algoritmo, inserta
"""

from fastapi import APIRouter

router = APIRouter()

import calendar
import random
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from itertools import combinations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from database import engine
from models import Asistencia, Festivo, Restriccion, Usuario

router = APIRouter(prefix="/cronograma", tags=["cronograma"])
SessionLocal = sessionmaker(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
LUNES = 0
CASA_POR_SEMANA = 2        # regla 5
MAX_CASA_POR_DIA = 2       # regla 7
MIN_EN_OFICINA = 1         # regla 8: siempre queda al menos 1 persona en OFICINA
HISTORIAL_SEMANAS = 4      # semanas hacia atrás que se miran para rotar días

INTENTOS_POR_SEMANA = 25   # reinicios aleatorios por semana
LIMITE_NODOS = 20_000      # tope de búsqueda (protege el tiempo de respuesta)

PESO_DIA_REPETIDO = 3.0    # penaliza repetir el mismo día de la semana (reglas 11 y 12)
PESO_PATRON_REPETIDO = 10.0  # penaliza repetir exactamente el patrón de la semana anterior
RUIDO = 2.0                # aleatoriedad al ordenar candidatos (regla 10)


# ---------------------------------------------------------------------------
# Estado en memoria
# ---------------------------------------------------------------------------
@dataclass
class Estado:
    usuarios: list[int]
    prohibidos: set[tuple[int, int]]            # pares restringidos, ambos sentidos
    festivos: set[date]
    registros: dict[tuple[int, date], str]      # (usuario, fecha) -> modalidad ya existente
    capacidad_dia: int
    casa_usuario: dict[int, set[date]] = field(default_factory=lambda: defaultdict(set))
    casa_dia: dict[date, set[int]] = field(default_factory=lambda: defaultdict(set))

    def __post_init__(self):
        for (u, d), modalidad in self.registros.items():
            if modalidad == "CASA":
                self.registrar_casa(u, d)

    def registrar_casa(self, usuario_id: int, fecha: date) -> None:
        self.casa_usuario[usuario_id].add(fecha)
        self.casa_dia[fecha].add(usuario_id)


def cabe_en_dia(usuario_id, ocupantes, capacidad, prohibidos) -> bool:
    """Valida regla 7 (máx. por día) y regla 9 (restricciones) para un día concreto."""
    if len(ocupantes) >= capacidad:
        return False
    return not any((usuario_id, otro) in prohibidos for otro in ocupantes)


# ---------------------------------------------------------------------------
# Algoritmo
# ---------------------------------------------------------------------------
def _recortar_cuotas(cuotas: dict[int, int], acumulado: dict[int, int], capacidad: int) -> None:
    """
    Si la demanda de CASA supera los cupos de la semana, quita cupos de forma justa:
    primero a quien tiene más cuota y, en empate, a quien más CASA lleva acumulado.
    Así, quien se queda corto esta semana tiene prioridad la siguiente (regla 12).
    """
    while sum(cuotas.values()) > capacidad:
        activos = [u for u, c in cuotas.items() if c > 0]
        u = max(activos, key=lambda x: (cuotas[x], acumulado[x], random.random()))
        cuotas[u] -= 1


def _dfs(estado: Estado, dias_casa, orden, candidatos):
    """
    Búsqueda con retroceso: asigna a cada usuario una combinación de días CASA
    respetando cupo diario y restricciones. Devuelve (asignacion | None, agotado).
    """
    ocupacion = {d: set(estado.casa_dia.get(d, ())) for d in dias_casa}
    asignacion: dict[int, tuple[date, ...]] = {}
    nodos = 0
    agotado = False

    def buscar(i: int) -> bool:
        nonlocal nodos, agotado
        if i == len(orden):
            return True
        u = orden[i]
        for combo in candidatos[u]:
            nodos += 1
            if nodos > LIMITE_NODOS:
                agotado = True
                return False
            if not all(
                cabe_en_dia(u, ocupacion[d], estado.capacidad_dia, estado.prohibidos)
                for d in combo
            ):
                continue
            for d in combo:
                ocupacion[d].add(u)
            asignacion[u] = combo
            if buscar(i + 1):
                return True
            for d in combo:
                ocupacion[d].discard(u)
            del asignacion[u]
            if agotado:
                return False
        return False

    ok = buscar(0)
    return (dict(asignacion) if ok else None), agotado


def _resolver(estado, dias_casa, cuotas, disponibles, costo_fn):
    """Varios reinicios aleatorios del DFS; se queda con la solución de menor costo."""
    activos = [u for u, c in cuotas.items() if c > 0]
    if not activos:
        return {}

    base = {
        u: {c: costo_fn(u, c) for c in combinations(disponibles[u], cuotas[u])}
        for u in activos
    }

    mejor, mejor_costo = None, float("inf")
    for _ in range(INTENTOS_POR_SEMANA):
        orden = activos[:]
        random.shuffle(orden)
        candidatos = {
            u: sorted(base[u], key=lambda c: base[u][c] + random.uniform(0, RUIDO))
            for u in orden
        }
        solucion, agotado = _dfs(estado, dias_casa, orden, candidatos)
        if solucion is None:
            if not agotado:
                break  # el DFS es completo: sin límite alcanzado, no hay solución
            continue
        costo = sum(base[u][solucion[u]] for u in activos)
        if costo < mejor_costo:
            mejor, mejor_costo = solucion, costo

    return mejor


def planificar_semana(estado: Estado, lunes: date, dias_casa: list[date]) -> None:
    """Asigna los días CASA de una semana y actualiza el estado."""
    if not dias_casa or estado.capacidad_dia == 0:
        return

    domingo = lunes + timedelta(days=6)
    desde = lunes - timedelta(weeks=HISTORIAL_SEMANAS)
    anterior = lunes - timedelta(days=7)

    cuotas, disponibles = {}, {}
    hist, acumulado, patron_ant, wd_semana = {}, {}, {}, {}

    for u in estado.usuarios:
        fechas = estado.casa_usuario[u]
        en_semana = {d for d in fechas if lunes <= d <= domingo}

        hist[u] = Counter(d.weekday() for d in fechas if desde <= d < lunes)
        acumulado[u] = sum(hist[u].values())
        patron_ant[u] = {d.weekday() for d in fechas if anterior <= d < lunes}
        wd_semana[u] = {d.weekday() for d in en_semana}

        # Regla 13 (parte en memoria): no se pisa un registro existente
        disponibles[u] = [
            d for d in dias_casa
            if (u, d) not in estado.registros
            and cabe_en_dia(u, estado.casa_dia.get(d, ()), estado.capacidad_dia, estado.prohibidos)
        ]
        # CASA que ya tiene en la semana (p. ej. del mes anterior) cuentan para la cuota
        cuotas[u] = min(max(0, CASA_POR_SEMANA - len(en_semana)), len(disponibles[u]))

    capacidad = sum(
        max(0, estado.capacidad_dia - len(estado.casa_dia.get(d, ()))) for d in dias_casa
    )
    _recortar_cuotas(cuotas, acumulado, capacidad)

    def costo(u: int, combo: tuple[date, ...]) -> float:
        c = sum(PESO_DIA_REPETIDO * hist[u][d.weekday()] for d in combo)
        patron = wd_semana[u] | {d.weekday() for d in combo}
        if combo and patron == patron_ant[u]:
            c += PESO_PATRON_REPETIDO
        return c

    # Si hay restricciones que impiden cumplir las cuotas, se baja una cuota y se reintenta.
    while True:
        solucion = _resolver(estado, dias_casa, cuotas, disponibles, costo)
        if solucion is not None:
            break
        activos = [u for u, c in cuotas.items() if c > 0]
        u = max(activos, key=lambda x: (cuotas[x], acumulado[x], random.random()))
        cuotas[u] -= 1

    for u, combo in solucion.items():
        for d in combo:
            estado.registrar_casa(u, d)


def construir_cronograma(estado, inicio, fin, nombres):
    """Recorre las semanas del mes y devuelve ([(usuario_id, fecha, modalidad)], advertencias)."""
    nuevos: list[tuple[int, date, str]] = []
    advertencias: list[str] = []

    lunes = inicio - timedelta(days=inicio.weekday())
    while lunes <= fin:
        laborales = [lunes + timedelta(days=i) for i in range(5)]
        # Reglas 3 y 4: sin fines de semana, sin festivos, y solo días del mes pedido
        dias_mes = [d for d in laborales if inicio <= d <= fin and d not in estado.festivos]
        dias_casa = [d for d in dias_mes if d.weekday() != LUNES]  # regla 2

        planificar_semana(estado, lunes, dias_casa)

        for d in dias_mes:
            for u in estado.usuarios:
                if (u, d) in estado.registros:  # regla 13
                    continue
                modalidad = "CASA" if u in estado.casa_dia.get(d, ()) else "OFICINA"
                estado.registros[(u, d)] = modalidad
                nuevos.append((u, d, modalidad))

        if dias_casa:
            completa = inicio <= lunes and lunes + timedelta(days=4) <= fin
            domingo = lunes + timedelta(days=6)
            for u in estado.usuarios:
                total = sum(1 for d in estado.casa_usuario[u] if lunes <= d <= domingo)
                if total < CASA_POR_SEMANA:
                    nota = "" if completa else " (semana parcial: se completa al generar el mes contiguo)"
                    advertencias.append(
                        f"Semana del {lunes:%Y-%m-%d}: {nombres[u]} tiene {total} día(s) "
                        f"CASA de {CASA_POR_SEMANA}{nota}"
                    )

        lunes += timedelta(days=7)

    return nuevos, advertencias


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/generar-mes-v2")
def generar_mes_v2(mes: int, anio: int, db: Session = Depends(get_db)):
    if not 1 <= mes <= 12:
        raise HTTPException(status_code=400, detail="El mes debe estar entre 1 y 12.")
    if not 2000 <= anio <= 2100:
        raise HTTPException(status_code=400, detail="Año fuera de rango.")

    # Evita que dos peticiones simultáneas generen el mismo mes (solo PostgreSQL)
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": anio * 100 + mes})

    usuarios = db.query(Usuario).order_by(Usuario.id).all()
    if not usuarios:
        raise HTTPException(status_code=400, detail="No hay usuarios registrados.")
    ids = [u.id for u in usuarios]
    nombres = {u.id: u.nombre for u in usuarios}

    inicio = date(anio, mes, 1)
    fin = date(anio, mes, calendar.monthrange(anio, mes)[1])

    # Ventana que se carga: historial previo + semanas completas que tocan el mes
    lunes_inicial = inicio - timedelta(days=inicio.weekday())
    domingo_final = fin + timedelta(days=6 - fin.weekday())
    desde = lunes_inicial - timedelta(weeks=HISTORIAL_SEMANAS)

    festivos = {
        f[0]
        for f in db.query(Festivo.fecha)
        .filter(Festivo.fecha >= lunes_inicial, Festivo.fecha <= domingo_final)
        .all()
    }

    registros = {
        (u, f): m
        for u, f, m in db.query(Asistencia.usuario_id, Asistencia.fecha, Asistencia.modalidad)
        .filter(Asistencia.fecha >= desde, Asistencia.fecha <= domingo_final)
        .all()
    }

    prohibidos: set[tuple[int, int]] = set()
    for a, b in db.query(Restriccion.usuario1_id, Restriccion.usuario2_id).all():
        prohibidos.add((a, b))
        prohibidos.add((b, a))

    estado = Estado(
        usuarios=ids,
        prohibidos=prohibidos,
        festivos=festivos,
        registros=registros,
        capacidad_dia=max(0, min(MAX_CASA_POR_DIA, len(ids) - MIN_EN_OFICINA)),
    )

    nuevos, advertencias = construir_cronograma(estado, inicio, fin, nombres)

    db.add_all(
        Asistencia(usuario_id=u, fecha=f, modalidad=m) for u, f, m in nuevos
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Otro proceso insertó asistencias al mismo tiempo. Intenta de nuevo.",
        )

    respuesta = {
        "mensaje": "Cronograma generado",
        "mes": mes,
        "anio": anio,
        "registros_creados": len(nuevos),
    }
    if advertencias:
        respuesta["advertencias"] = advertencias
    return respuesta
