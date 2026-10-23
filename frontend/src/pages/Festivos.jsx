import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL } from "../config";

// "2026-10-20" o "2026-10-20T00:00:00" -> "2026-10-20" (sin desfase de zona horaria)
const claveFecha = (valor) => String(valor).slice(0, 10);

// Convierte "YYYY-MM-DD" en un Date local (sin pasar por UTC)
const fechaLocal = (clave) => {
  const [a, m, d] = claveFecha(clave).split("-").map(Number);
  return new Date(a, m - 1, d);
};

const formatearFecha = (clave) =>
  fechaLocal(clave).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** Intenta leer el mensaje de error que envía el servidor (campo "detail"). */
const leerError = async (res, porDefecto) => {
  try {
    const cuerpo = await res.json();
    return typeof cuerpo.detail === "string" ? cuerpo.detail : porDefecto;
  } catch {
    return porDefecto;
  }
};

function Festivos() {
  const [festivos, setFestivos] = useState([]);
  const [anio, setAnio] = useState(new Date().getFullYear());

  const [fecha, setFecha] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [idEditando, setIdEditando] = useState(null);
  const [fechaEditada, setFechaEditada] = useState("");
  const [descripcionEditada, setDescripcionEditada] = useState("");
  const [idPorEliminar, setIdPorEliminar] = useState(null);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo: "ok" | "error", texto }

  // ---------- Carga de datos ----------
  const cargarFestivos = useCallback(async () => {
    const res = await fetch(`${API_URL}/festivos`);
    if (!res.ok) throw new Error("No se pudieron cargar los festivos.");
    setFestivos(await res.json());
  }, []);

  useEffect(() => {
    const cargarInicial = async () => {
      try {
        await cargarFestivos();
      } catch {
        setAviso({ tipo: "error", texto: `No se pudo conectar con el servidor en ${API_URL}.` });
      } finally {
        setCargando(false);
      }
    };

    cargarInicial();
  }, [cargarFestivos]);

  // El aviso desaparece solo a los 4 segundos
  useEffect(() => {
    if (!aviso) return;
    const temporizador = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(temporizador);
  }, [aviso]);

  // ---------- Datos derivados ----------
  const festivosDelAnio = useMemo(
    () =>
      festivos
        .filter((f) => claveFecha(f.fecha).startsWith(`${anio}-`))
        .sort((a, b) => claveFecha(a.fecha).localeCompare(claveFecha(b.fecha))),
    [festivos, anio]
  );

  const fechaOcupada = (valor, excluirId = null) =>
    festivos.some((f) => f.id !== excluirId && claveFecha(f.fecha) === valor);

  // ---------- Acciones ----------
  const crearFestivo = async () => {
    const limpia = descripcion.trim();

    if (!fecha || !limpia) {
      setAviso({ tipo: "error", texto: "Completa la fecha y la descripción." });
      return;
    }
    if (fechaOcupada(fecha)) {
      setAviso({ tipo: "error", texto: "Ya existe un festivo en esa fecha." });
      return;
    }

    try {
      setGuardando(true);

      const params = new URLSearchParams({ fecha, descripcion: limpia });
      const res = await fetch(`${API_URL}/festivos?${params}`, { method: "POST" });

      if (!res.ok) {
        setAviso({ tipo: "error", texto: await leerError(res, "No se pudo crear el festivo.") });
        return;
      }

      // Muestra el año del festivo creado para que se vea en la tabla
      setAnio(fechaLocal(fecha).getFullYear());
      setFecha("");
      setDescripcion("");

      await cargarFestivos();
      setAviso({ tipo: "ok", texto: "Festivo creado." });
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardando(false);
    }
  };

  const empezarEdicion = (festivo) => {
    setIdPorEliminar(null);
    setIdEditando(festivo.id);
    setFechaEditada(claveFecha(festivo.fecha));
    setDescripcionEditada(festivo.descripcion);
  };

  const cancelarEdicion = () => {
    setIdEditando(null);
    setFechaEditada("");
    setDescripcionEditada("");
  };

  const guardarEdicion = async (id) => {
    const limpia = descripcionEditada.trim();

    if (!fechaEditada || !limpia) {
      setAviso({ tipo: "error", texto: "Completa la fecha y la descripción." });
      return;
    }
    if (fechaOcupada(fechaEditada, id)) {
      setAviso({ tipo: "error", texto: "Ya existe un festivo en esa fecha." });
      return;
    }

    try {
      setGuardando(true);

      const params = new URLSearchParams({ fecha: fechaEditada, descripcion: limpia });
      const res = await fetch(`${API_URL}/festivos/${id}?${params}`, { method: "PUT" });

      if (!res.ok) {
        setAviso({ tipo: "error", texto: await leerError(res, "No se pudo actualizar el festivo.") });
        return;
      }

      setAnio(fechaLocal(fechaEditada).getFullYear());
      cancelarEdicion();
      await cargarFestivos();
      setAviso({ tipo: "ok", texto: "Festivo actualizado." });
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardando(false);
    }
  };

  const eliminarFestivo = async (id) => {
    try {
      setGuardando(true);

      const res = await fetch(`${API_URL}/festivos/${id}`, { method: "DELETE" });

      if (!res.ok) {
        setAviso({ tipo: "error", texto: await leerError(res, "No se pudo eliminar el festivo.") });
        return;
      }

      setIdPorEliminar(null);
      await cargarFestivos();
      setAviso({ tipo: "ok", texto: "Festivo eliminado." });
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardando(false);
    }
  };

  // ---------- Render ----------
  return (
    <div className="festivos">
      <style>{estilos}</style>

      <header className="festivos__encabezado">
        <h1 className="festivos__titulo">Festivos</h1>
        <p className="festivos__subtitulo">
          En estos días no se pueden registrar asistencias y aparecen en rojo en el cronograma.
        </p>
      </header>

      {aviso && (
        <p className={`aviso aviso--${aviso.tipo}`} role={aviso.tipo === "error" ? "alert" : "status"}>
          {aviso.texto}
        </p>
      )}

      <section className="tarjeta" aria-labelledby="titulo-nuevo">
        <h2 id="titulo-nuevo" className="tarjeta__titulo">Nuevo festivo</h2>

        <div className="formulario">
          <label className="campo campo--fecha">
            <span>Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              disabled={cargando || guardando}
            />
          </label>

          <label className="campo campo--texto">
            <span>Descripción</span>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !guardando && crearFestivo()}
              placeholder="Ej. Día de la Independencia"
              disabled={cargando || guardando}
            />
          </label>

          <button
            type="button"
            className="boton boton--primario"
            onClick={crearFestivo}
            disabled={cargando || guardando}
          >
            {guardando && idEditando === null && idPorEliminar === null ? "Guardando…" : "Agregar festivo"}
          </button>
        </div>
      </section>

      <section className="tarjeta" aria-labelledby="titulo-lista">
        <div className="tarjeta__cabecera">
          <h2 id="titulo-lista" className="tarjeta__titulo">
            Festivos de {anio}
            {!cargando && <span className="contador">{festivosDelAnio.length}</span>}
          </h2>

          <label className="campo campo--chico">
            <span>Año</span>
            <input
              type="number"
              min="2000"
              max="2100"
              value={anio}
              onChange={(e) => {
                const valor = Number(e.target.value);
                if (valor) setAnio(valor);
              }}
            />
          </label>
        </div>

        {cargando && <p className="vacio">Cargando festivos…</p>}

        {!cargando && festivosDelAnio.length === 0 && (
          <p className="vacio">No hay festivos en {anio}. Agrega el primero con el formulario de arriba.</p>
        )}

        {!cargando && festivosDelAnio.length > 0 && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th className="tabla__acciones">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {festivosDelAnio.map((f) => (
                  <tr key={f.id}>
                    {idEditando === f.id ? (
                      <>
                        <td>
                          <input
                            className="entrada-tabla"
                            type="date"
                            value={fechaEditada}
                            onChange={(e) => setFechaEditada(e.target.value)}
                            aria-label="Nueva fecha"
                          />
                        </td>
                        <td>
                          <input
                            className="entrada-tabla entrada-tabla--ancha"
                            type="text"
                            value={descripcionEditada}
                            onChange={(e) => setDescripcionEditada(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") guardarEdicion(f.id);
                              if (e.key === "Escape") cancelarEdicion();
                            }}
                            aria-label="Nueva descripción"
                            autoFocus
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="tabla__fecha">{formatearFecha(f.fecha)}</td>
                        <td>{f.descripcion}</td>
                      </>
                    )}

                    <td className="tabla__acciones">
                      {idEditando === f.id ? (
                        <span className="grupo-botones">
                          <button
                            type="button"
                            className="boton boton--primario boton--chico"
                            onClick={() => guardarEdicion(f.id)}
                            disabled={guardando}
                          >
                            Guardar
                          </button>
                          <button type="button" className="boton boton--suave" onClick={cancelarEdicion}>
                            Cancelar
                          </button>
                        </span>
                      ) : idPorEliminar === f.id ? (
                        <span className="grupo-botones">
                          <span className="confirmacion">¿Eliminar este festivo?</span>
                          <button
                            type="button"
                            className="boton boton--peligro"
                            onClick={() => eliminarFestivo(f.id)}
                            disabled={guardando}
                          >
                            Sí, eliminar
                          </button>
                          <button type="button" className="boton boton--suave" onClick={() => setIdPorEliminar(null)}>
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <span className="grupo-botones">
                          <button type="button" className="boton boton--suave" onClick={() => empezarEdicion(f)}>
                            Editar
                          </button>
                          <button
                            type="button"
                            className="boton boton--suave boton--alerta"
                            onClick={() => {
                              cancelarEdicion();
                              setIdPorEliminar(f.id);
                            }}
                          >
                            Eliminar
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const estilos = `
.festivos {
  --tinta: #1e293b;
  --tinta-suave: #64748b;
  --linea: #e2e8f0;
  --fondo: #f8fafc;
  --superficie: #ffffff;
  --primario: #3b5bdb;
  --primario-oscuro: #2f49b3;
  --festivo: #e11d48;

  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  color: var(--tinta);
  background: var(--fondo);
  padding: 32px clamp(16px, 4vw, 48px);
  min-height: 100vh;
  box-sizing: border-box;
}

.festivos__encabezado { margin-bottom: 20px; }
.festivos__titulo { margin: 0; font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; }
.festivos__subtitulo { margin: 4px 0 0; color: var(--tinta-suave); font-size: 0.95rem; }

.aviso {
  margin: 0 0 16px;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 0.9rem;
  border: 1px solid;
}
.aviso--ok { color: #065f46; background: #ecfdf5; border-color: #a7f3d0; }
.aviso--error { color: #9f1239; background: #fff1f2; border-color: #fecdd3; }

.tarjeta {
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.tarjeta__cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.tarjeta__titulo {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px;
  font-size: 1.1rem;
  font-weight: 600;
}
.tarjeta__cabecera .tarjeta__titulo { margin: 0; }

.contador {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--festivo);
  background: #ffe4e6;
  border-radius: 999px;
  padding: 2px 10px;
}

.formulario { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; }

.campo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--tinta-suave);
}
.campo--fecha { flex: 0 0 180px; }
.campo--texto { flex: 1 1 260px; }
.campo--chico { flex: 0 0 auto; }

.campo input,
.entrada-tabla {
  font: inherit;
  font-size: 0.95rem;
  color: var(--tinta);
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: 8px;
  padding: 10px 12px;
  box-sizing: border-box;
}
.campo--chico input { width: 84px; padding: 8px 12px; }
.entrada-tabla { padding: 7px 10px; }
.entrada-tabla--ancha { width: 100%; max-width: 360px; }
.campo input:disabled { background: var(--fondo); }

.campo input:focus-visible,
.entrada-tabla:focus-visible,
.boton:focus-visible {
  outline: 2px solid var(--primario);
  outline-offset: 2px;
}

.boton {
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 10px 18px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.boton:disabled { opacity: 0.6; cursor: not-allowed; }

.boton--primario { color: #fff; background: var(--primario); }
.boton--primario:hover:not(:disabled) { background: var(--primario-oscuro); }
.boton--chico { padding: 6px 12px; }

.boton--suave {
  color: var(--tinta);
  background: var(--superficie);
  border-color: var(--linea);
  padding: 6px 12px;
}
.boton--suave:hover { background: var(--fondo); }
.boton--alerta:hover { color: var(--festivo); border-color: #fecdd3; background: #fff1f2; }

.boton--peligro { color: #fff; background: var(--festivo); padding: 6px 12px; }
.boton--peligro:hover:not(:disabled) { background: #be123c; }

.vacio { margin: 0; color: var(--tinta-suave); }

.tabla-contenedor { overflow-x: auto; border: 1px solid var(--linea); border-radius: 10px; }
.tabla { width: 100%; border-collapse: collapse; font-size: 0.9rem; }

.tabla th,
.tabla td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--linea);
}

.tabla thead th {
  background: var(--fondo);
  color: var(--tinta-suave);
  font-weight: 500;
  font-size: 0.8rem;
}

.tabla tbody tr:last-child td { border-bottom: none; }
.tabla tbody tr:hover { background: #fafbff; }

.tabla__fecha { font-weight: 600; text-transform: capitalize; white-space: nowrap; }
.tabla__acciones { text-align: right !important; }

.grupo-botones {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.confirmacion { font-size: 0.85rem; color: var(--festivo); }
`;

export default Festivos;