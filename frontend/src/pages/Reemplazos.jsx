import { useCallback, useEffect, useState } from "react";

// Cambia esta URL si tu backend corre en otro host o puerto.
const API_URL = "http://127.0.0.1:8000";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const NUEVA = "nueva"; // valor del selector para escribir una persona nueva

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

/** "2026-11-09" -> "lun, 9 nov" (sin desfase de zona horaria). */
function formatearFecha(texto) {
  const [a, m, d] = String(texto).split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
}

const FORM_VACIO = { fecha: "", usuarioId: "", suplenteId: "", nombreNuevo: "", motivo: "" };

function Reemplazos() {
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());

  const [usuarios, setUsuarios] = useState([]);
  const [suplentes, setSuplentes] = useState([]);
  const [reemplazos, setReemplazos] = useState([]);

  const [form, setForm] = useState(FORM_VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  const [editando, setEditando] = useState(null); // { id, usuario, fecha, suplenteId, motivo }
  const [errorEdicion, setErrorEdicion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [renombrando, setRenombrando] = useState(null); // { id, nombre }
  const [errorPersonas, setErrorPersonas] = useState("");

  const cargarPersonas = useCallback(async () => {
    const [u, s] = await Promise.all([llamar("/usuarios"), llamar("/suplentes")]);
    setUsuarios(u);
    setSuplentes(s);
  }, []);

  const cargarReemplazos = useCallback(async () => {
    setReemplazos(await llamar("/reemplazos", { anio, mes }));
  }, [anio, mes]);

  useEffect(() => {
    cargarPersonas().catch((e) => setError(e.message));
  }, [cargarPersonas]);

  useEffect(() => {
    cargarReemplazos().catch((e) => setError(e.message));
    setEditando(null);
  }, [cargarReemplazos]);

  const cambiar = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const formCompleto =
    form.fecha &&
    form.usuarioId &&
    form.suplenteId &&
    (form.suplenteId !== NUEVA || form.nombreNuevo.trim());

  // --- Registrar -------------------------------------------------------------
  const registrar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError("");
    setExito("");

    let creada = null;
    try {
      let suplenteId = form.suplenteId;

      if (suplenteId === NUEVA) {
        creada = await llamar("/suplentes", { nombre: form.nombreNuevo }, "POST");
        suplenteId = creada.id;
      }

      await llamar(
        "/reemplazos",
        { fecha: form.fecha, usuario_id: form.usuarioId, suplente_id: suplenteId, motivo: form.motivo },
        "POST"
      );

      const usuario = usuarios.find((u) => String(u.id) === String(form.usuarioId))?.nombre;
      const persona = creada?.nombre ?? suplentes.find((s) => String(s.id) === String(suplenteId))?.nombre;
      setExito(`Reemplazo registrado: ${usuario} no viene el ${formatearFecha(form.fecha)} y va ${persona}.`);

      // Muestra el mes de la fecha registrada
      const [a, m] = form.fecha.split("-").map(Number);
      const mismoMes = a === anio && m === mes;
      setForm({ ...FORM_VACIO, fecha: form.fecha });
      setAnio(a);
      setMes(m);
      await cargarPersonas();
      if (mismoMes) await cargarReemplazos();
    } catch (err) {
      setError(err.message);
      if (creada) {
        // La persona nueva sí quedó guardada: se deja seleccionada para reintentar
        await cargarPersonas().catch(() => {});
        setForm((f) => ({ ...f, suplenteId: String(creada.id), nombreNuevo: "" }));
      }
    } finally {
      setEnviando(false);
    }
  };

  // --- Editar o eliminar un reemplazo ----------------------------------------
  const abrirEditor = (r) => {
    setEditando({ id: r.id, usuario: r.usuario, fecha: r.fecha, suplenteId: String(r.suplente_id), motivo: r.motivo ?? "" });
    setErrorEdicion("");
  };

  const guardarEdicion = async () => {
    setGuardando(true);
    setErrorEdicion("");
    try {
      await llamar(
        `/reemplazos/${editando.id}`,
        { suplente_id: editando.suplenteId, motivo: editando.motivo },
        "PUT"
      );
      await cargarReemplazos();
      setEditando(null);
    } catch (err) {
      setErrorEdicion(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminarReemplazo = async (r) => {
    if (!window.confirm(`¿Eliminar el reemplazo de ${r.usuario} del ${formatearFecha(r.fecha)}?`)) return;
    setError("");
    try {
      await llamar(`/reemplazos/${r.id}`, {}, "DELETE");
      if (editando?.id === r.id) setEditando(null);
      await cargarReemplazos();
    } catch (err) {
      setError(err.message);
    }
  };

  // --- Personas que reemplazan -----------------------------------------------
  const guardarNombre = async () => {
    setErrorPersonas("");
    try {
      await llamar(`/suplentes/${renombrando.id}`, { nombre: renombrando.nombre }, "PUT");
      setRenombrando(null);
      await Promise.all([cargarPersonas(), cargarReemplazos()]);
    } catch (err) {
      setErrorPersonas(err.message);
    }
  };

  const eliminarPersona = async (s) => {
    if (!window.confirm(`¿Eliminar a ${s.nombre}? También se borrarán los reemplazos que tiene registrados.`)) return;
    setErrorPersonas("");
    try {
      await llamar(`/suplentes/${s.id}`, {}, "DELETE");
      await Promise.all([cargarPersonas(), cargarReemplazos()]);
    } catch (err) {
      setErrorPersonas(err.message);
    }
  };

  return (
    <div className="rem">
      <style>{estilos}</style>

      <section className="rem__panel">
        <h1 className="rem__titulo">Reemplazos</h1>
        <p className="rem__ayuda">
          Registra cuando un usuario no va a la oficina y otra persona va en su lugar. Quien reemplaza no
          tiene que estar en la lista de usuarios.
        </p>

        <form className="rem__formulario" onSubmit={registrar}>
          <label className="rem__campo">
            Fecha
            <input type="date" value={form.fecha} onChange={cambiar("fecha")} disabled={enviando} />
          </label>

          <label className="rem__campo">
            No viene
            <select value={form.usuarioId} onChange={cambiar("usuarioId")} disabled={enviando}>
              <option value="">Elige un usuario</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </label>

          <label className="rem__campo">
            Viene en su lugar
            <select value={form.suplenteId} onChange={cambiar("suplenteId")} disabled={enviando}>
              <option value="">Elige quién viene</option>
              {suplentes.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
              <option value={NUEVA}>Otra persona nueva…</option>
            </select>
          </label>

          {form.suplenteId === NUEVA && (
            <label className="rem__campo">
              Nombre de la persona
              <input
                type="text"
                value={form.nombreNuevo}
                onChange={cambiar("nombreNuevo")}
                placeholder="Nombre y apellido"
                disabled={enviando}
              />
            </label>
          )}

          <label className="rem__campo rem__campo--ancho">
            Motivo (opcional)
            <input
              type="text"
              value={form.motivo}
              onChange={cambiar("motivo")}
              placeholder="Ej. incapacidad, cita médica"
              disabled={enviando}
            />
          </label>

          <div className="rem__enviar">
            <button type="submit" className="rem__boton rem__boton--principal" disabled={enviando || !formCompleto}>
              {enviando ? "Registrando…" : "Registrar reemplazo"}
            </button>
          </div>
        </form>

        {error && <p className="rem__mensaje rem__mensaje--error" role="alert">{error}</p>}
        {exito && <p className="rem__mensaje rem__mensaje--ok" role="status">{exito}</p>}
      </section>

      <section className="rem__panel">
        <div className="rem__encabezado">
          <h2 className="rem__subtitulo">Reemplazos de {MESES[mes - 1].toLowerCase()} {anio}</h2>

          <div className="rem__filtros">
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))} aria-label="Mes">
              {MESES.map((nombre, i) => (
                <option key={nombre} value={i + 1}>{nombre}</option>
              ))}
            </select>
            <input
              type="number"
              min="2000"
              max="2100"
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              aria-label="Año"
            />
          </div>
        </div>

        {reemplazos.length === 0 ? (
          <p className="rem__vacio">No hay reemplazos registrados en este mes.</p>
        ) : (
          <div className="rem__tabla-scroll">
            <table className="rem__tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>No viene</th>
                  <th>Viene en su lugar</th>
                  <th>Motivo</th>
                  <th><span className="rem__sr">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {reemplazos.map((r) => (
                  <tr key={r.id} className={editando?.id === r.id ? "rem__fila--activa" : undefined}>
                    <td>{formatearFecha(r.fecha)}</td>
                    <td>{r.usuario}</td>
                    <td>{r.suplente}</td>
                    <td className="rem__motivo">{r.motivo ?? "—"}</td>
                    <td className="rem__celda-acciones">
                      <button className="rem__boton rem__boton--chico" onClick={() => abrirEditor(r)}>Editar</button>
                      <button className="rem__boton rem__boton--chico rem__boton--peligro" onClick={() => eliminarReemplazo(r)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editando && (
          <div className="rem__editor" role="region" aria-label="Editar reemplazo">
            <div className="rem__editor-titulo">
              <strong>{editando.usuario}</strong>
              <span>{formatearFecha(editando.fecha)}. Cambia quién va en su lugar o el motivo.</span>
            </div>

            <div className="rem__formulario">
              <label className="rem__campo">
                Viene en su lugar
                <select
                  value={editando.suplenteId}
                  onChange={(e) => setEditando({ ...editando, suplenteId: e.target.value })}
                  disabled={guardando}
                >
                  {suplentes.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </label>

              <label className="rem__campo rem__campo--ancho">
                Motivo
                <input
                  type="text"
                  value={editando.motivo}
                  onChange={(e) => setEditando({ ...editando, motivo: e.target.value })}
                  disabled={guardando}
                />
              </label>

              <div className="rem__enviar">
                <button className="rem__boton rem__boton--principal" onClick={guardarEdicion} disabled={guardando}>
                  {guardando ? "Guardando…" : "Guardar cambios"}
                </button>
                <button className="rem__boton" onClick={() => setEditando(null)} disabled={guardando}>
                  Cancelar
                </button>
              </div>
            </div>

            {errorEdicion && <p className="rem__mensaje rem__mensaje--error" role="alert">{errorEdicion}</p>}
          </div>
        )}
      </section>

      <section className="rem__panel">
        <details>
          <summary className="rem__resumen">Personas que pueden reemplazar ({suplentes.length})</summary>

          {suplentes.length === 0 ? (
            <p className="rem__vacio">
              Todavía no hay personas. Se agregan al registrar un reemplazo con «Otra persona nueva».
            </p>
          ) : (
            <ul className="rem__personas">
              {suplentes.map((s) => (
                <li key={s.id} className="rem__persona">
                  {renombrando?.id === s.id ? (
                    <>
                      <input
                        type="text"
                        value={renombrando.nombre}
                        onChange={(e) => setRenombrando({ ...renombrando, nombre: e.target.value })}
                        aria-label={`Nuevo nombre para ${s.nombre}`}
                      />
                      <button className="rem__boton rem__boton--chico rem__boton--principal" onClick={guardarNombre}>
                        Guardar
                      </button>
                      <button className="rem__boton rem__boton--chico" onClick={() => setRenombrando(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="rem__persona-nombre">{s.nombre}</span>
                      <button
                        className="rem__boton rem__boton--chico"
                        onClick={() => setRenombrando({ id: s.id, nombre: s.nombre })}
                      >
                        Renombrar
                      </button>
                      <button className="rem__boton rem__boton--chico rem__boton--peligro" onClick={() => eliminarPersona(s)}>
                        Eliminar
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {errorPersonas && <p className="rem__mensaje rem__mensaje--error" role="alert">{errorPersonas}</p>}
        </details>
      </section>
    </div>
  );
}

const estilos = `
.rem {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1000px;
  margin: 0 auto;
  padding: clamp(16px, 4vw, 40px);
  box-sizing: border-box;
  color: #1e293b;
}

.rem__panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: clamp(16px, 3vw, 28px);
}

.rem__titulo { margin: 0 0 6px; font-size: 1.35rem; letter-spacing: -0.01em; }
.rem__subtitulo { margin: 0; font-size: 1.05rem; }
.rem__ayuda { margin: 0 0 20px; max-width: 70ch; color: #64748b; font-size: 0.92rem; line-height: 1.5; }

.rem__formulario { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; align-items: end; }

.rem__campo { display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; font-weight: 500; color: #475569; }
.rem__campo--ancho { grid-column: span 2; }
.rem__campo input,
.rem__campo select,
.rem__filtros select,
.rem__filtros input,
.rem__persona input {
  padding: 9px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  font: inherit;
  color: #1e293b;
  min-width: 0;
}
.rem__campo input:focus-visible,
.rem__campo select:focus-visible,
.rem__filtros select:focus-visible,
.rem__filtros input:focus-visible,
.rem__persona input:focus-visible { outline: 2px solid #3b5bdb; outline-offset: 1px; }

.rem__enviar { display: flex; flex-wrap: wrap; gap: 10px; }

.rem__boton {
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
.rem__boton:hover:not(:disabled) { background: #f1f5f9; }
.rem__boton:focus-visible { outline: 2px solid #3b5bdb; outline-offset: 2px; }
.rem__boton:disabled { opacity: 0.55; cursor: not-allowed; }
.rem__boton--chico { padding: 5px 10px; font-size: 0.82rem; }
.rem__boton--principal { background: #3b5bdb; border-color: #3b5bdb; color: #ffffff; }
.rem__boton--principal:hover:not(:disabled) { background: #364fc7; }
.rem__boton--peligro { color: #c92a2a; border-color: #ffc9c9; }
.rem__boton--peligro:hover:not(:disabled) { background: #fff5f5; }

.rem__mensaje { margin: 18px 0 0; padding: 12px 14px; border-radius: 8px; font-size: 0.9rem; }
.rem__mensaje--ok { background: #ebfbee; color: #2b8a3e; }
.rem__mensaje--error { background: #fff5f5; color: #c92a2a; }

.rem__encabezado { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.rem__filtros { display: flex; gap: 8px; }
.rem__filtros input { width: 90px; }

.rem__vacio { margin: 12px 0 0; color: #64748b; font-size: 0.92rem; }

.rem__tabla-scroll { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
.rem__tabla { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
.rem__tabla th,
.rem__tabla td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #f1f5f9; }
.rem__tabla thead th { background: #f8fafc; color: #475569; font-weight: 600; font-size: 0.85rem; }
.rem__tabla tbody tr:last-child td { border-bottom: none; }
.rem__fila--activa td { background: #edf2ff; }
.rem__motivo { color: #64748b; }
.rem__celda-acciones { display: flex; gap: 6px; justify-content: flex-end; white-space: nowrap; }

.rem__editor { margin-top: 16px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
.rem__editor-titulo { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-bottom: 14px; }
.rem__editor-titulo span { color: #64748b; font-size: 0.85rem; }

.rem__resumen { cursor: pointer; font-weight: 600; font-size: 1.05rem; }
.rem__resumen:focus-visible { outline: 2px solid #3b5bdb; outline-offset: 2px; border-radius: 4px; }
.rem__personas { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.rem__persona { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.rem__persona-nombre { flex: 1 1 160px; }

.rem__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (max-width: 720px) {
  .rem__campo--ancho { grid-column: span 1; }
}
`;

export default Reemplazos;
