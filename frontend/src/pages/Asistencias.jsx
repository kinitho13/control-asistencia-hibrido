import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL } from "../config";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Llama al backend y convierte los errores de FastAPI en mensajes legibles. */
async function llamar(ruta, params = {}, metodo = "GET") {
  const query = new URLSearchParams(params).toString();
  let respuesta;

  try {
    respuesta = await fetch(`${API_URL}${ruta}${query ? `?${query}` : ""}`, { method: metodo });
  } catch {
    throw new Error(`No se pudo conectar con el servidor (${API_URL}). Revisa que el backend esté encendido.`);
  }

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    /* respuesta sin cuerpo */
  }

  if (!respuesta.ok) {
    const detalle = datos?.detail;
    if (typeof detalle === "string") throw new Error(detalle);
    if (Array.isArray(detalle)) throw new Error(detalle.map((d) => d.msg).join(", "));
    throw new Error(`Error ${respuesta.status} del servidor.`);
  }

  return datos;
}

/** "2026-11-09" -> Date local (evita el desfase de zona horaria de new Date("2026-11-09")). */
function aFecha(texto) {
  const [a, m, d] = texto.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function GeneradorCronograma() {
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());

  const [accion, setAccion] = useState(null); // "generar" | "regenerar" | "eliminar" | null
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const [asistencias, setAsistencias] = useState([]);

  // Editor de una asignación
  const [seleccion, setSeleccion] = useState(null);
  const [edicion, setEdicion] = useState({ fecha: "", modalidad: "CASA" });
  const [errorEdicion, setErrorEdicion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const ocupado = accion !== null;
  const anioValido = Number.isInteger(anio) && anio >= 2000 && anio <= 2100;

  const cargarVista = useCallback(async () => {
    try {
      setAsistencias(await llamar("/asistencias"));
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    cargarVista();
  }, [cargarVista]);

  const ejecutar = async (nombre, tarea) => {
    setAccion(nombre);
    setError("");
    setResultado(null);
    try {
      await tarea();
      await cargarVista();
    } catch (e) {
      setError(e.message);
    } finally {
      setAccion(null);
    }
  };

  const generar = async () => {
    const datos = await llamar("/cronograma/generar-mes-v2", { mes, anio }, "POST");
    setResultado({
      titulo: `Cronograma de ${MESES[mes - 1].toLowerCase()} ${anio} generado`,
      detalle: `${datos.registros_creados} registros creados`,
      advertencias: datos.advertencias ?? [],
    });
  };

  const eliminar = async () => {
    const datos = await llamar("/asistencias/mes", { anio, mes }, "DELETE");
    return datos.eliminados;
  };

  const onGenerar = () => ejecutar("generar", generar);

  const onEliminar = () => {
    if (!window.confirm(`¿Borrar todas las asistencias de ${MESES[mes - 1]} ${anio}? Esta acción no se puede deshacer.`)) return;
    ejecutar("eliminar", async () => {
      const n = await eliminar();
      setResultado({
        titulo: `Asistencias de ${MESES[mes - 1].toLowerCase()} ${anio} eliminadas`,
        detalle: `${n} registros borrados`,
        advertencias: [],
      });
    });
  };

  const onRegenerar = () => {
    if (!window.confirm(`Se borrarán las asistencias de ${MESES[mes - 1]} ${anio} y se generarán de nuevo. ¿Continuar?`)) return;
    ejecutar("regenerar", async () => {
      await eliminar();
      await generar();
    });
  };

  // --- Editar o eliminar una asignación ------------------------------------
  useEffect(() => {
    setSeleccion(null);
  }, [mes, anio]);

  const abrirEditor = (registro) => {
    setSeleccion(registro);
    setEdicion({ fecha: String(registro.fecha), modalidad: registro.modalidad });
    setErrorEdicion("");
  };

  const guardarEdicion = async () => {
    setGuardando(true);
    setErrorEdicion("");
    try {
      await llamar(
        `/asistencias/${seleccion.id}`,
        { fecha: edicion.fecha, modalidad: edicion.modalidad },
        "PUT"
      );
      await cargarVista();
      setSeleccion(null);
    } catch (e) {
      setErrorEdicion(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrarAsignacion = async () => {
    if (!window.confirm(`¿Eliminar la asignación de ${seleccion.usuario} del ${seleccion.fecha}?`)) return;
    setGuardando(true);
    setErrorEdicion("");
    try {
      await llamar(`/asistencias/${seleccion.id}`, {}, "DELETE");
      await cargarVista();
      setSeleccion(null);
    } catch (e) {
      setErrorEdicion(e.message);
    } finally {
      setGuardando(false);
    }
  };

  // --- Vista previa del mes seleccionado -----------------------------------
  const vista = useMemo(() => {
    const prefijo = `${anio}-${String(mes).padStart(2, "0")}-`;
    const delMes = asistencias.filter((a) => String(a.fecha).startsWith(prefijo));

    const fechas = [...new Set(delMes.map((a) => a.fecha))].sort();
    const usuarios = [
      ...new Map(delMes.map((a) => [a.usuario_id, a.usuario])).entries(),
    ].sort((x, y) => x[1].localeCompare(y[1]));

    const celdas = new Map(delMes.map((a) => [`${a.usuario_id}|${a.fecha}`, a]));
    return { fechas, usuarios, celdas };
  }, [asistencias, mes, anio]);

  const hayDatos = vista.fechas.length > 0;

  return (
    <div className="gen">
      <style>{estilos}</style>

      <section className="gen__panel">
        <h1 className="gen__titulo">Generador de cronograma</h1>
        <p className="gen__ayuda">
          Reparte los días en casa de todos los usuarios para el mes elegido. Los lunes todos van a la
          oficina, no se programan festivos ni fines de semana y se respetan las restricciones.
        </p>

        <div className="gen__formulario">
          <label className="gen__campo">
            Mes
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))} disabled={ocupado}>
              {MESES.map((nombre, i) => (
                <option key={nombre} value={i + 1}>{nombre}</option>
              ))}
            </select>
          </label>

          <label className="gen__campo">
            Año
            <input
              type="number"
              min="2000"
              max="2100"
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              disabled={ocupado}
            />
          </label>

          <div className="gen__acciones">
            <button className="gen__boton gen__boton--principal" onClick={onGenerar} disabled={ocupado || !anioValido}>
              {accion === "generar" ? "Generando…" : "Generar cronograma"}
            </button>
            <button className="gen__boton" onClick={onRegenerar} disabled={ocupado || !anioValido}>
              {accion === "regenerar" ? "Regenerando…" : "Borrar y regenerar"}
            </button>
            <button className="gen__boton gen__boton--peligro" onClick={onEliminar} disabled={ocupado || !anioValido}>
              {accion === "eliminar" ? "Borrando…" : "Borrar mes"}
            </button>
          </div>
        </div>

        {!anioValido && <p className="gen__mensaje gen__mensaje--error">El año debe estar entre 2000 y 2100.</p>}
        {error && <p className="gen__mensaje gen__mensaje--error" role="alert">{error}</p>}

        {resultado && (
          <div className="gen__mensaje gen__mensaje--ok" role="status">
            <strong>{resultado.titulo}</strong>
            <span>{resultado.detalle}</span>

            {resultado.advertencias.length > 0 && (
              <details className="gen__avisos">
                <summary>{resultado.advertencias.length} avisos sobre cupos</summary>
                <ul>
                  {resultado.advertencias.map((texto) => (
                    <li key={texto}>{texto}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      <section className="gen__panel">
        <h2 className="gen__subtitulo">
          {MESES[mes - 1]} {anio}
        </h2>

        {!hayDatos ? (
          <p className="gen__vacio">
            Aún no hay asistencias en este mes. Pulsa «Generar cronograma» para crearlas.
          </p>
        ) : (
          <>
            <p className="gen__leyenda">
              <span className="gen__celda gen__celda--casa">C</span> en casa
              <span className="gen__celda gen__celda--oficina">O</span> en oficina
              <span className="gen__pista">Haz clic en una celda para editarla o eliminarla.</span>
            </p>

            <div className="gen__tabla-scroll">
              <table className="gen__tabla">
                <thead>
                  <tr>
                    <th className="gen__nombre">Usuario</th>
                    {vista.fechas.map((f) => {
                      const d = aFecha(f);
                      const inicioSemana = d.getDay() === 1;
                      return (
                        <th key={f} className={inicioSemana ? "gen__semana" : undefined}>
                          <span className="gen__dia">{DIAS_CORTOS[d.getDay()]}</span>
                          {d.getDate()}
                        </th>
                      );
                    })}
                    <th className="gen__total">En casa</th>
                  </tr>
                </thead>
                <tbody>
                  {vista.usuarios.map(([id, nombre]) => {
                    let total = 0;
                    return (
                      <tr key={id}>
                        <th className="gen__nombre" scope="row">{nombre}</th>
                        {vista.fechas.map((f) => {
                          const registro = vista.celdas.get(`${id}|${f}`);
                          const modalidad = registro?.modalidad;
                          if (modalidad === "CASA") total += 1;
                          const inicioSemana = aFecha(f).getDay() === 1;
                          return (
                            <td key={f} className={inicioSemana ? "gen__semana" : undefined}>
                              {modalidad ? (
                                <button
                                  type="button"
                                  className={`gen__celda gen__celda--${modalidad.toLowerCase()} gen__celda--boton${seleccion?.id === registro.id ? " gen__celda--activa" : ""}`}
                                  title={`${nombre}, ${f}: ${modalidad === "CASA" ? "casa" : "oficina"}. Clic para editar o eliminar`}
                                  aria-label={`Editar ${nombre}, ${f}, ${modalidad === "CASA" ? "casa" : "oficina"}`}
                                  onClick={() => abrirEditor(registro)}
                                >
                                  {modalidad === "CASA" ? "C" : "O"}
                                </button>
                              ) : null}
                            </td>
                          );
                        })}
                        <td className="gen__total">{total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {seleccion && (
              <div className="gen__editor" role="region" aria-label="Editar asignación">
                <div className="gen__editor-titulo">
                  <strong>{seleccion.usuario}</strong>
                  <span>Edita la fecha o la modalidad, o elimina esta asignación.</span>
                </div>

                <div className="gen__formulario">
                  <label className="gen__campo">
                    Fecha
                    <input
                      type="date"
                      value={edicion.fecha}
                      onChange={(e) => setEdicion({ ...edicion, fecha: e.target.value })}
                      disabled={guardando}
                    />
                  </label>

                  <label className="gen__campo">
                    Modalidad
                    <select
                      value={edicion.modalidad}
                      onChange={(e) => setEdicion({ ...edicion, modalidad: e.target.value })}
                      disabled={guardando}
                    >
                      <option value="CASA">Casa</option>
                      <option value="OFICINA">Oficina</option>
                    </select>
                  </label>

                  <div className="gen__acciones">
                    <button
                      className="gen__boton gen__boton--principal"
                      onClick={guardarEdicion}
                      disabled={guardando || !edicion.fecha}
                    >
                      {guardando ? "Guardando…" : "Guardar cambios"}
                    </button>
                    <button className="gen__boton gen__boton--peligro" onClick={borrarAsignacion} disabled={guardando}>
                      Eliminar asignación
                    </button>
                    <button className="gen__boton" onClick={() => setSeleccion(null)} disabled={guardando}>
                      Cancelar
                    </button>
                  </div>
                </div>

                {errorEdicion && (
                  <p className="gen__mensaje gen__mensaje--error" role="alert">{errorEdicion}</p>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

const estilos = `
.gen {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1200px;
  margin: 0 auto;
  padding: clamp(16px, 4vw, 40px);
  box-sizing: border-box;
  color: #1e293b;
}

.gen__panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: clamp(16px, 3vw, 28px);
}

.gen__titulo { margin: 0 0 6px; font-size: 1.35rem; letter-spacing: -0.01em; }
.gen__subtitulo { margin: 0 0 14px; font-size: 1.05rem; }
.gen__ayuda { margin: 0 0 20px; max-width: 70ch; color: #64748b; font-size: 0.92rem; line-height: 1.5; }

.gen__formulario { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; }

.gen__campo { display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; font-weight: 500; color: #475569; }
.gen__campo select,
.gen__campo input {
  min-width: 140px;
  padding: 9px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  font: inherit;
  color: #1e293b;
}
.gen__campo input { min-width: 100px; width: 100px; }
.gen__campo select:focus-visible,
.gen__campo input:focus-visible { outline: 2px solid #3b5bdb; outline-offset: 1px; }

.gen__acciones { display: flex; flex-wrap: wrap; gap: 10px; margin-left: auto; }

.gen__boton {
  padding: 9px 16px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  color: #334155;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.gen__boton:hover:not(:disabled) { background: #f1f5f9; }
.gen__boton:focus-visible { outline: 2px solid #3b5bdb; outline-offset: 2px; }
.gen__boton:disabled { opacity: 0.55; cursor: not-allowed; }

.gen__boton--principal { background: #3b5bdb; border-color: #3b5bdb; color: #ffffff; }
.gen__boton--principal:hover:not(:disabled) { background: #364fc7; }

.gen__boton--peligro { color: #c92a2a; border-color: #ffc9c9; }
.gen__boton--peligro:hover:not(:disabled) { background: #fff5f5; }

.gen__mensaje {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 18px 0 0;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 0.9rem;
}
.gen__mensaje--ok { background: #ebfbee; color: #2b8a3e; }
.gen__mensaje--error { background: #fff5f5; color: #c92a2a; }

.gen__avisos { margin-top: 6px; color: #5c4a00; }
.gen__avisos summary { cursor: pointer; font-weight: 500; }
.gen__avisos ul { margin: 8px 0 0; padding-left: 18px; line-height: 1.5; }

.gen__vacio { margin: 0; color: #64748b; font-size: 0.92rem; }

.gen__leyenda { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; color: #64748b; font-size: 0.85rem; }
.gen__leyenda .gen__celda:not(:first-child) { margin-left: 14px; }

.gen__tabla-scroll { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
.gen__tabla { border-collapse: collapse; width: 100%; font-size: 0.82rem; }
.gen__tabla th,
.gen__tabla td { padding: 6px 4px; text-align: center; border-bottom: 1px solid #f1f5f9; }
.gen__tabla thead th { background: #f8fafc; color: #475569; font-weight: 600; line-height: 1.25; }
.gen__tabla tbody tr:last-child th,
.gen__tabla tbody tr:last-child td { border-bottom: none; }

.gen__dia { display: block; font-size: 0.7rem; font-weight: 500; color: #94a3b8; }
.gen__semana { border-left: 2px solid #e2e8f0; }

.gen__nombre {
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 110px;
  padding: 6px 12px !important;
  background: #ffffff;
  text-align: left !important;
  font-weight: 600;
  white-space: nowrap;
}
.gen__tabla thead .gen__nombre { background: #f8fafc; }
.gen__total { min-width: 64px; font-weight: 600; border-left: 2px solid #e2e8f0; }

.gen__celda {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
}
.gen__celda--casa { background: #edf2ff; color: #3b5bdb; }
.gen__celda--oficina { background: #f1f5f9; color: #64748b; }

.gen__celda--boton { padding: 0; border: none; font-family: inherit; cursor: pointer; transition: box-shadow 0.15s; }
.gen__celda--boton:hover { box-shadow: 0 0 0 2px #bac8ff; }
.gen__celda--boton:focus-visible { outline: 2px solid #3b5bdb; outline-offset: 2px; }
.gen__celda--activa { box-shadow: 0 0 0 2px #3b5bdb; }

.gen__pista { margin-left: auto; }

.gen__editor { margin-top: 16px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
.gen__editor-titulo { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-bottom: 14px; }
.gen__editor-titulo span { color: #64748b; font-size: 0.85rem; }
.gen__editor .gen__campo input { width: auto; min-width: 150px; }

@media (max-width: 720px) {
  .gen__acciones { margin-left: 0; width: 100%; }
}
`;

export default GeneradorCronograma;