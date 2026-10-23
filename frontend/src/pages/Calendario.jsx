import { useEffect, useMemo, useState } from "react";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import esLocale from "@fullcalendar/core/locales/es";

const API_URL = "http://localhost:8000";

const MODALIDADES = {
  CASA: { etiqueta: "Casa", clase: "evento--casa" },
  OFICINA: { etiqueta: "Oficina", clase: "evento--oficina" },
  reemplazo: { etiqueta: "Reemplazo", clase: "evento--reemplazo" },
};

// "2026-10-20" o "2026-10-20T00:00:00" -> "2026-10-20" (sin desfase de zona horaria)
const claveFecha = (valor) => String(valor).slice(0, 10);

// Date local -> "YYYY-MM-DD"
const claveDesdeDate = (fecha) =>
  [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, "0"),
    String(fecha.getDate()).padStart(2, "0"),
  ].join("-");

function Calendario() {
  const [asistencias, setAsistencias] = useState([]);
  const [festivos, setFestivos] = useState([]);
  const [reemplazos, setReemplazos] = useState([]);
  const [usuarioFiltro, setUsuarioFiltro] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [anioVisible, setAnioVisible] = useState(new Date().getFullYear());

  // ---------- Carga de datos ----------
  useEffect(() => {
    const controlador = new AbortController();

    const cargar = async () => {
      try {
        setCargando(true);
        setError(null);

        const pedir = async (ruta) => {
          const res = await fetch(`${API_URL}${ruta}`, { signal: controlador.signal });
          if (!res.ok) throw new Error(`Error en ${ruta}`);
          return res.json();
        };

        const [dAsistencias, dFestivos, dReemplazos] =
  await Promise.all([
    pedir("/calendario"),
    pedir("/festivos"),
    pedir("/reemplazos/todos"),
  ]);

        setAsistencias(dAsistencias);
        setFestivos(dFestivos);
        setReemplazos(dReemplazos);
      } catch (e) {
        if (e.name !== "AbortError") {
          setError(`No se pudo cargar el calendario. Verifica que el servidor esté activo en ${API_URL}.`);
        }
      } finally {
        if (!controlador.signal.aborted) setCargando(false);
      }
    };

    cargar();
    return () => controlador.abort();
  }, []);

  // ---------- Datos derivados ----------
  const nombresUsuarios = useMemo(
    () => [...new Set(asistencias.map((a) => a.usuario))].sort((a, b) => a.localeCompare(b, "es")),
    [asistencias]
  );
  const reemplazosPorFechaUsuario =
  useMemo(() => {

    const mapa = {};

    reemplazos.forEach((r) => {

      mapa[
        `${claveFecha(r.fecha)}-${r.usuario}`
      ] = true;

    });

    return mapa;

  }, [reemplazos]);

  const clavesFestivos = useMemo(
    () => new Set(festivos.map((f) => claveFecha(f.fecha))),
    [festivos]
  );

  // ¿Hay festivos registrados en el año que se está viendo?
  const hayFestivosEnAnio = useMemo(
    () => festivos.some((f) => claveFecha(f.fecha).startsWith(`${anioVisible}-`)),
    [festivos, anioVisible]
  );

  const eventos = useMemo(() => {
const deAsistencias = asistencias
  .filter((a) => {

    const clave =
      `${claveFecha(a.fecha)}-${a.usuario}`;

    return (
      !reemplazosPorFechaUsuario[clave] &&
      (!usuarioFiltro || a.usuario === usuarioFiltro)
    );

  })
  .map((a) => {

    const info = MODALIDADES[a.modalidad];

    return {
      id: `asistencia-${a.id}`,
      title: `${a.usuario} · ${info ? info.etiqueta : a.modalidad}`,
      start: claveFecha(a.fecha),
      allDay: true,
      classNames: ["evento", info ? info.clase : ""],
    };

  });

    const deFestivos = festivos.map((f) => ({
      id: `festivo-${f.id}`,
      title: f.descripcion,
      start: claveFecha(f.fecha),
      allDay: true,
      classNames: ["evento", "evento--festivo"],
    }));
    const deReemplazos = reemplazos.map((r) => ({

  id: `reemplazo-${r.id}`,

  title:
    `🔄 ${r.suplente} reemplaza a ${r.usuario}`,

  start: claveFecha(r.fecha),

  allDay: true,

  classNames: [
    "evento",
    "evento--reemplazo"
  ]

}));

    // Los festivos van primero para que aparezcan arriba en cada día
    return [...deFestivos, ...deAsistencias, ...deReemplazos];
  }, [asistencias, festivos, reemplazos, usuarioFiltro]);

  // ---------- Render ----------
  return (
    <div className="calendario">
      <style>{estilos}</style>

      <header className="calendario__encabezado">
        <div>
          <h1 className="calendario__titulo">Calendario</h1>
          <p className="calendario__subtitulo">Quién trabaja desde casa y quién desde la oficina cada día.</p>
        </div>

        <label className="campo">
          <span>Persona</span>
          <select
            value={usuarioFiltro}
            onChange={(e) => setUsuarioFiltro(e.target.value)}
            disabled={cargando || nombresUsuarios.length === 0}
          >
            <option value="">Todas las personas</option>
            {nombresUsuarios.map((nombre) => (
              <option key={nombre} value={nombre}>{nombre}</option>
            ))}
          </select>
        </label>
      </header>

      <ul className="leyenda" aria-label="Leyenda">
        <li><span className="muestra muestra--casa" /> Casa</li>
        <li><span className="muestra muestra--oficina" /> Oficina</li>
        <li><span className="muestra muestra--festivo" /> Festivo</li>
      </ul>

      {cargando && <p className="estado">Cargando calendario…</p>}

      {error && <p className="estado estado--error" role="alert">{error}</p>}

      {!cargando && !error && (
        <div className="calendario__contenedor">
          {!hayFestivosEnAnio && (
            <p className="nota">
              No hay festivos registrados en {anioVisible}. Agrégalos en la sección Festivos para verlos aquí.
            </p>
          )}

          <FullCalendar
            plugins={[dayGridPlugin]}
            initialView="dayGridMonth"
            locale={esLocale}
            events={eventos}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,dayGridWeek",
            }}
            height="auto"
            dayMaxEvents={4}
            fixedWeekCount={false}
            datesSet={(arg) => setAnioVisible(arg.view.currentStart.getFullYear())}
            dayCellClassNames={(arg) =>
              clavesFestivos.has(claveDesdeDate(arg.date)) ? ["dia-festivo"] : []
            }
          />
        </div>
      )}
    </div>
  );
}

const estilos = `
.calendario {
  --tinta: #1e293b;
  --tinta-suave: #64748b;
  --linea: #e2e8f0;
  --fondo: #f8fafc;
  --superficie: #ffffff;
  --casa: #0f9d7a;
  --oficina: #3b5bdb;
  --festivo: #e11d48;
  --primario: #3b5bdb;

  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  color: var(--tinta);
  background: var(--fondo);
  padding: 32px clamp(16px, 4vw, 48px);
  min-height: 100vh;
  box-sizing: border-box;
}

.calendario__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
}

.calendario__titulo { margin: 0; font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; }
.calendario__subtitulo { margin: 4px 0 0; color: var(--tinta-suave); font-size: 0.95rem; }

.campo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.8rem;
  color: var(--tinta-suave);
}

.campo select {
  font: inherit;
  font-size: 0.95rem;
  color: var(--tinta);
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: 8px;
  padding: 8px 12px;
  min-width: 200px;
}
.campo select:focus-visible { outline: 2px solid var(--primario); outline-offset: 1px; }

.leyenda {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  font-size: 0.85rem;
  color: var(--tinta-suave);
}
.leyenda li { display: flex; align-items: center; gap: 8px; }

.muestra { width: 14px; height: 14px; border-radius: 4px; display: inline-block; }
.muestra--casa { background: var(--casa); }
.muestra--oficina { background: var(--oficina); }
.muestra--festivo { background: var(--festivo); }

.estado {
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: 12px;
  padding: 24px;
  color: var(--tinta-suave);
}
.estado--error { color: #9f1239; background: #fff1f2; border-color: #fecdd3; }

.nota {
  margin: 0 0 16px;
  padding: 10px 14px;
  font-size: 0.85rem;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
}

.calendario__contenedor {
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

/* ---- Ajustes de FullCalendar ---- */
.calendario .fc {
  --fc-border-color: var(--linea);
  --fc-today-bg-color: #fffbeb;
  --fc-button-bg-color: var(--superficie);
  --fc-button-border-color: var(--linea);
  --fc-button-text-color: var(--tinta);
  --fc-button-hover-bg-color: var(--fondo);
  --fc-button-hover-border-color: var(--linea);
  --fc-button-active-bg-color: #edf2ff;
  --fc-button-active-border-color: var(--primario);
  --fc-event-border-color: transparent;
  font-size: 0.85rem;
}

.calendario .fc .fc-toolbar-title { font-size: 1.25rem; font-weight: 700; text-transform: capitalize; }
.calendario .fc .fc-button { font-weight: 600; text-transform: capitalize; box-shadow: none; }
.calendario .fc .fc-button:focus-visible { outline: 2px solid var(--primario); outline-offset: 2px; box-shadow: none; }
.calendario .fc .fc-col-header-cell-cushion { padding: 8px 4px; color: var(--tinta-suave); font-weight: 500; text-transform: capitalize; }
.calendario .fc .fc-daygrid-day-number { padding: 6px 8px; color: var(--tinta); }

.calendario .fc .dia-festivo { background: #fff1f2; }
.calendario .fc .dia-festivo .fc-daygrid-day-number { color: var(--festivo); font-weight: 700; }

.calendario .fc .evento {
  border-radius: 6px;
  padding: 1px 6px;
  margin: 1px 4px;
  color: #fff;
  font-weight: 600;
  cursor: default;
}
.calendario .fc .evento--casa { background: var(--casa); }
.calendario .fc .evento--oficina { background: var(--oficina); }
.calendario .fc .evento--festivo { background: var(--festivo); }
.calendario .fc .evento--reemplazo { background: #f59e0b;
}

.calendario .fc .fc-more-link { color: var(--tinta-suave); font-weight: 600; }

@media (max-width: 640px) {
  .calendario__contenedor { padding: 10px; }
  .calendario .fc .fc-toolbar { flex-direction: column; gap: 10px; }
}
`;

export default Calendario;