import { useEffect, useMemo, useState } from "react";
import { API_URL, apiFetch } from "../config";
import Exportaciones from "../components/Exportaciones";
import FiltroPersonas from "../components/FiltroPersonas";
import { useFiltroPersonas } from "../hooks/useFiltroPersonas";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import esLocale from "@fullcalendar/core/locales/es";

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
  const [cierres, setCierres] = useState([]);
  const [reemplazos, setReemplazos] = useState([]);
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
          const res = await apiFetch(ruta, { signal: controlador.signal });
          if (!res.ok) throw new Error(`Error en ${ruta}`);
          return res.json();
        };

        const [dAsistencias, dFestivos, dCierres, dReemplazos] =
  await Promise.all([
    pedir("/calendario"),
    pedir("/festivos"),
    pedir("/cierres"),
    pedir("/reemplazos/todos"),
  ]);

        setAsistencias(dAsistencias);
        setFestivos(dFestivos);
        setCierres(dCierres);
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
  const {
    personasSeleccionadas,
    seleccionarPrincipales,
    seleccionarTodos,
    alternarPersona,
  } = useFiltroPersonas(nombresUsuarios);
  const personasVisibles = useMemo(
    () => new Set(personasSeleccionadas),
    [personasSeleccionadas]
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
      personasVisibles.has(a.usuario)
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
    const deCierres = cierres.map((cierre) => {
      const finExclusivo = new Date(`${claveFecha(cierre.fecha_fin)}T00:00:00Z`);
      finExclusivo.setUTCDate(finExclusivo.getUTCDate() + 1);
      return {
        id: `cierre-${cierre.id}`,
        title: `Cierre: ${cierre.descripcion}`,
        start: claveFecha(cierre.fecha_inicio),
        end: finExclusivo.toISOString().slice(0, 10),
        allDay: true,
        classNames: ["evento", "evento--cierre"],
      };
    });
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
    return [...deFestivos, ...deCierres, ...deAsistencias, ...deReemplazos];
  }, [asistencias, festivos, cierres, reemplazos, reemplazosPorFechaUsuario, personasVisibles]);

  const filasExportacion = useMemo(() => {
    const filas = asistencias
      .filter((a) => (
        personasVisibles.has(a.usuario) &&
        !reemplazosPorFechaUsuario[`${claveFecha(a.fecha)}-${a.usuario}`]
      ))
      .map((a) => ({
        Fecha: claveFecha(a.fecha),
        Persona: a.usuario,
        Registro: MODALIDADES[a.modalidad]?.etiqueta || a.modalidad,
      }));

    reemplazos.forEach((r) => filas.push({
        Fecha: claveFecha(r.fecha),
        Persona: r.usuario,
        Registro: `${r.suplente} reemplaza a ${r.usuario}`,
      }));

    festivos.forEach((f) => filas.push({
      Fecha: claveFecha(f.fecha),
      Persona: "",
      Registro: `Festivo: ${f.descripcion}`,
    }));
    cierres.forEach((cierre) => {
      const fin = new Date(`${claveFecha(cierre.fecha_fin)}T00:00:00Z`);
      for (const dia = new Date(`${claveFecha(cierre.fecha_inicio)}T00:00:00Z`); dia <= fin; dia.setUTCDate(dia.getUTCDate() + 1)) {
        filas.push({
          Fecha: dia.toISOString().slice(0, 10),
          Persona: "",
          Registro: `Cierre de oficina: ${cierre.descripcion}`,
        });
      }
    });

    return filas.sort((a, b) => a.Fecha.localeCompare(b.Fecha) || a.Persona.localeCompare(b.Persona, "es"));
  }, [asistencias, festivos, cierres, reemplazos, reemplazosPorFechaUsuario, personasVisibles]);

  // ---------- Render ----------
  return (
    <div className="calendario" id="reporte-exportable">
      <style>{estilos}</style>

      <header className="calendario__encabezado">
        <div>
          <h1 className="calendario__titulo">Calendario</h1>
          <p className="calendario__subtitulo">Quién trabaja desde casa y quién desde la oficina cada día.</p>
        </div>

        <div className="calendario__acciones">
          <FiltroPersonas
            usuarios={nombresUsuarios}
            seleccionados={personasSeleccionadas}
            onSeleccionarPrincipales={seleccionarPrincipales}
            onSeleccionarTodos={seleccionarTodos}
            onAlternarPersona={alternarPersona}
          />
          <Exportaciones
            nombreArchivo="calendario-asistencias"
            nombreHoja="Calendario"
            tituloPdf="Calendario de asistencias"
            filas={filasExportacion}
          />
        </div>
      </header>

      <ul className="leyenda" aria-label="Leyenda">
        <li><span className="muestra muestra--casa" /> Casa</li>
        <li><span className="muestra muestra--oficina" /> Oficina</li>
        <li><span className="muestra muestra--festivo" /> Festivo</li>
        <li><span className="muestra muestra--cierre" /> Cierre de oficina</li>
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

  font-family: var(--sans);
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
.calendario__acciones { display: grid; justify-items: end; gap: 10px; }

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
.muestra--cierre { background: #7c3aed; }

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
.calendario .fc .evento--cierre { background: #7c3aed; border-color: #7c3aed; }
.calendario .fc .evento--reemplazo { background: #f59e0b;
}

.calendario .fc .fc-more-link { color: var(--tinta-suave); font-weight: 600; }

@media (max-width: 640px) {
  .calendario__contenedor { padding: 10px; }
  .calendario .fc .fc-toolbar { flex-direction: column; gap: 10px; }
  .calendario__acciones { justify-items: start; }
}
`;

export default Calendario;