import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../config";
import Icono from "../components/Icono";

const ZONA = "America/Bogota";
const ROLES_GESTION = ["ADMIN", "LIDER"];

function hoyLocal() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

function horaLocal(valor) {
  if (!valor) return "";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(valor));
}

function fechaLegible(valor) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: ZONA,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${valor}T12:00:00-05:00`));
}

async function leerRespuesta(respuesta) {
  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }
  if (!respuesta.ok) {
    throw new Error(
      typeof datos?.detail === "string"
        ? datos.detail
        : "No se pudo completar la operación. Inténtalo nuevamente."
    );
  }
  return datos;
}

function leerUsuarioInicial() {
  try {
    return JSON.parse(localStorage.getItem("usuario") || "null");
  } catch {
    return null;
  }
}

function Marcaciones() {
  const [usuario] = useState(leerUsuarioInicial);
  const [misRegistros, setMisRegistros] = useState([]);
  const [modalidad, setModalidad] = useState("OFICINA");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [fechaEquipo, setFechaEquipo] = useState(hoyLocal);
  const [equipo, setEquipo] = useState([]);
  const [ediciones, setEdiciones] = useState({});
  const [fechaEquipoCargada, setFechaEquipoCargada] = useState(null);
  const [guardandoUsuario, setGuardandoUsuario] = useState(null);
  const esGestor = ROLES_GESTION.includes(usuario?.rol?.toUpperCase());
  const hoy = hoyLocal();
  const cargandoEquipo = fechaEquipoCargada !== fechaEquipo;

  const cargarMisRegistros = useCallback(async () => {
    const respuesta = await apiFetch("/marcaciones/mias");
    setMisRegistros(await leerRespuesta(respuesta));
  }, []);

  const cargarEquipo = useCallback(async () => {
    if (!esGestor) return;
    try {
      const respuesta = await apiFetch(`/marcaciones/equipo?fecha=${fechaEquipo}`);
      const datos = await leerRespuesta(respuesta);
      setEquipo(datos);
      setFechaEquipoCargada(fechaEquipo);
      setEdiciones(
        Object.fromEntries(
          datos.map((fila) => [
            fila.usuario_id,
            {
              estado: fila.estado === "SIN MARCAR" ? "PRESENTE" : fila.estado,
              modalidad: fila.modalidad || "OFICINA",
              entrada: horaLocal(fila.entrada),
              salida: horaLocal(fila.salida),
              motivo: fila.motivo || "",
            },
          ])
        )
      );
    } catch (e) {
      setError(e.message);
      setFechaEquipoCargada(fechaEquipo);
    }
  }, [esGestor, fechaEquipo]);

  useEffect(() => {
    cargarMisRegistros()
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [cargarMisRegistros]);

  useEffect(() => {
    cargarEquipo();
  }, [cargarEquipo]);

  const registroHoy = useMemo(
    () => misRegistros.find((registro) => registro.fecha === hoy),
    [misRegistros, hoy]
  );

  const marcar = async (accion) => {
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const respuesta = await apiFetch(`/marcaciones/${accion}`, {
        method: "POST",
        headers: accion === "entrada" ? { "Content-Type": "application/json" } : undefined,
        body: accion === "entrada" ? JSON.stringify({ modalidad }) : undefined,
      });
      await leerRespuesta(respuesta);
      await cargarMisRegistros();
      setAviso(accion === "entrada" ? "Entrada registrada correctamente." : "Salida registrada correctamente.");
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEdicion = (usuarioId, campo, valor) => {
    setEdiciones((actuales) => ({
      ...actuales,
      [usuarioId]: { ...actuales[usuarioId], [campo]: valor },
    }));
  };

  const guardarEquipo = async (fila) => {
    const edicion = ediciones[fila.usuario_id];
    setGuardandoUsuario(fila.usuario_id);
    setError("");
    setAviso("");
    try {
      const respuesta = await apiFetch(
        `/marcaciones/equipo/${fila.usuario_id}?fecha=${fechaEquipo}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            estado: edicion.estado,
            modalidad: edicion.estado === "PRESENTE" ? edicion.modalidad : null,
            entrada: edicion.estado === "PRESENTE" ? edicion.entrada || null : null,
            salida: edicion.estado === "PRESENTE" ? edicion.salida || null : null,
            motivo: edicion.motivo.trim() || null,
          }),
        }
      );
      await leerRespuesta(respuesta);
      await Promise.all([cargarEquipo(), cargarMisRegistros()]);
      setAviso(`Asistencia de ${fila.usuario} guardada.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardandoUsuario(null);
    }
  };

  return (
    <main className="marcaciones">
      <style>{estilos}</style>
      <header className="marcaciones__encabezado">
        <p className="marcaciones__eyebrow">ASISTENCIA REAL</p>
        <h1>Mi asistencia</h1>
        <p>Registra tu entrada y salida. Las horas se guardan en la zona horaria de Colombia.</p>
      </header>

      {error && <p className="marcaciones__mensaje marcaciones__mensaje--error" role="alert">{error}</p>}
      {aviso && <p className="marcaciones__mensaje marcaciones__mensaje--ok" role="status">{aviso}</p>}

      <section className="marcaciones__panel marcaciones__personal" aria-labelledby="marcaciones-hoy">
        <div className="marcaciones__panel-titulo">
          <div className="marcaciones__icono"><Icono nombre="marcacion" /></div>
          <div>
            <h2 id="marcaciones-hoy">Marcación de hoy</h2>
            <p>{fechaLegible(hoy)}</p>
          </div>
          <span className={`marcaciones__estado marcaciones__estado--${(registroHoy?.estado || "pendiente").toLowerCase().replace(" ", "-")}`}>
            {registroHoy?.estado || "PENDIENTE"}
          </span>
        </div>

        <div className="marcaciones__horas">
          <div><span>Entrada</span><strong>{horaLocal(registroHoy?.entrada) || "Sin marcar"}</strong></div>
          <div><span>Salida</span><strong>{horaLocal(registroHoy?.salida) || "Sin marcar"}</strong></div>
          <div><span>Modalidad</span><strong>{registroHoy?.modalidad || "—"}</strong></div>
        </div>

        <div className="marcaciones__acciones">
          <label>
            Modalidad de hoy
            <select value={modalidad} onChange={(e) => setModalidad(e.target.value)}>
              <option value="OFICINA">Oficina</option>
              <option value="CASA">Casa</option>
            </select>
          </label>
          <button
            type="button"
            className="marcaciones__boton marcaciones__boton--primario"
            onClick={() => marcar("entrada")}
            disabled={guardando || Boolean(registroHoy?.entrada)}
          >
            {guardando ? "Guardando…" : "Marcar entrada"}
          </button>
          <button
            type="button"
            className="marcaciones__boton"
            onClick={() => marcar("salida")}
            disabled={guardando || !registroHoy?.entrada || Boolean(registroHoy?.salida)}
          >
            Marcar salida
          </button>
        </div>
      </section>

      <section className="marcaciones__panel">
        <h2>Mis últimos registros</h2>
        {cargando ? (
          <p className="marcaciones__vacio">Cargando tus registros…</p>
        ) : misRegistros.length === 0 ? (
          <p className="marcaciones__vacio">Aún no tienes registros de asistencia.</p>
        ) : (
          <div className="marcaciones__tabla-scroll">
            <table className="marcaciones__tabla">
              <thead><tr><th>Fecha</th><th>Estado</th><th>Modalidad</th><th>Entrada</th><th>Salida</th></tr></thead>
              <tbody>
                {misRegistros.map((registro) => (
                  <tr key={registro.id}>
                    <td>{fechaLegible(registro.fecha)}</td>
                    <td>{registro.estado}</td>
                    <td>{registro.modalidad || "—"}</td>
                    <td>{horaLocal(registro.entrada) || "—"}</td>
                    <td>{horaLocal(registro.salida) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {esGestor && (
        <section className="marcaciones__panel marcaciones__equipo">
          <div className="marcaciones__equipo-encabezado">
            <div>
              <h2>Pase de lista del equipo</h2>
              <p>Registra o corrige el estado, modalidad y horas de cada persona.</p>
            </div>
            <label>
              Fecha
              <input type="date" value={fechaEquipo} onChange={(e) => setFechaEquipo(e.target.value)} />
            </label>
          </div>
          {cargandoEquipo ? (
            <p className="marcaciones__vacio">Cargando equipo…</p>
          ) : equipo.length === 0 ? (
            <p className="marcaciones__vacio">No hay personas activas para mostrar.</p>
          ) : (
            <div className="marcaciones__tabla-scroll">
              <table className="marcaciones__tabla marcaciones__tabla--equipo">
                <thead>
                  <tr><th>Persona</th><th>Estado</th><th>Modalidad</th><th>Entrada</th><th>Salida</th><th>Motivo/nota</th><th>Acción</th></tr>
                </thead>
                <tbody>
                  {equipo.map((fila) => {
                    const edicion = ediciones[fila.usuario_id];
                    if (!edicion) return null;
                    return (
                      <tr key={fila.usuario_id}>
                        <td>{fila.usuario}<small className="marcaciones__estado-actual">{fila.estado}</small></td>
                        <td>
                          <select value={edicion.estado} onChange={(e) => cambiarEdicion(fila.usuario_id, "estado", e.target.value)}>
                            <option value="PRESENTE">Presente</option>
                            <option value="AUSENTE">Ausente</option>
                          </select>
                        </td>
                        <td>
                          <select value={edicion.modalidad} disabled={edicion.estado !== "PRESENTE"} onChange={(e) => cambiarEdicion(fila.usuario_id, "modalidad", e.target.value)}>
                            <option value="OFICINA">Oficina</option>
                            <option value="CASA">Casa</option>
                          </select>
                        </td>
                        <td><input aria-label={`Entrada de ${fila.usuario}`} type="time" value={edicion.entrada} disabled={edicion.estado !== "PRESENTE"} onChange={(e) => cambiarEdicion(fila.usuario_id, "entrada", e.target.value)} /></td>
                        <td><input aria-label={`Salida de ${fila.usuario}`} type="time" value={edicion.salida} disabled={edicion.estado !== "PRESENTE"} onChange={(e) => cambiarEdicion(fila.usuario_id, "salida", e.target.value)} /></td>
                        <td><input aria-label={`Motivo de ${fila.usuario}`} value={edicion.motivo} placeholder="Opcional" onChange={(e) => cambiarEdicion(fila.usuario_id, "motivo", e.target.value)} /></td>
                        <td>
                          <button
                            type="button"
                            className="marcaciones__guardar"
                            onClick={() => guardarEquipo(fila)}
                            disabled={guardandoUsuario === fila.usuario_id}
                          >
                            {guardandoUsuario === fila.usuario_id ? "Guardando…" : "Guardar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

const estilos = `
.marcaciones {
  --marcacion-texto: #f1f5f9;
  --marcacion-suave: #b8c1d9;
  min-height: 100vh;
  padding: clamp(20px, 4vw, 42px);
  color: var(--marcacion-texto);
  background:
    radial-gradient(ellipse at 82% 0%, rgba(45, 212, 191, 0.08), transparent 38%),
    linear-gradient(135deg, #030712, #050816 55%, #111827);
  font-family: var(--sans);
}
.marcaciones__encabezado { margin-bottom: 22px; }
.marcaciones__eyebrow { margin: 0 0 4px; color: #94a3b8; font-size: .72rem; font-weight: 700; letter-spacing: .18em; }
.marcaciones h1 { margin: 0 0 10px; color: #f8fafc; font-size: clamp(1.7rem, 4vw, 2.3rem); line-height: 1.2; }
.marcaciones__encabezado > p:last-child, .marcaciones__equipo-encabezado p { margin: 0; color: var(--marcacion-suave); line-height: 1.5; }
.marcaciones__panel { margin-bottom: 18px; padding: clamp(18px, 3vw, 26px); border: 1px solid rgba(255,255,255,.15); border-radius: 18px; background: linear-gradient(145deg,rgba(255,255,255,.1),rgba(255,255,255,.045)); box-shadow: 0 18px 48px rgba(0,0,0,.22),inset 0 1px rgba(255,255,255,.08); backdrop-filter: blur(18px) saturate(125%); -webkit-backdrop-filter: blur(18px) saturate(125%); }
.marcaciones__panel h2 { margin: 0 0 14px; color: #f8fafc; font-size: 1.15rem; }
.marcaciones__panel-titulo { display: flex; align-items: center; gap: 12px; }
.marcaciones__panel-titulo h2 { margin: 0 0 2px; }
.marcaciones__panel-titulo p { margin: 0; color: var(--marcacion-suave); text-transform: capitalize; }
.marcaciones__icono { display: grid; width: 44px; height: 44px; flex: 0 0 auto; place-items: center; border: 1px solid rgba(94,234,212,.25); border-radius: 13px; color: #5eead4; background: rgba(45,212,191,.1); }
.marcaciones__icono svg { width: 24px; height: 24px; }
.marcaciones__estado { margin-left: auto; padding: 6px 10px; border: 1px solid rgba(255,255,255,.14); border-radius: 999px; color: #cbd5e1; background: rgba(255,255,255,.06); font-size: .75rem; font-weight: 700; }
.marcaciones__estado--presente { color: #99f6e4; border-color: rgba(45,212,191,.3); background: rgba(13,148,136,.17); }
.marcaciones__estado--ausente { color: #fecaca; border-color: rgba(248,113,113,.3); background: rgba(127,29,29,.22); }
.marcaciones__horas { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; margin: 20px 0; }
.marcaciones__horas div { display: grid; gap: 5px; padding: 13px; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; background: rgba(5,8,22,.24); }
.marcaciones__horas span, .marcaciones__acciones label, .marcaciones__equipo-encabezado label { color: var(--marcacion-suave); font-size: .8rem; }
.marcaciones__horas strong { color: #f8fafc; }
.marcaciones__acciones { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; }
.marcaciones__acciones label, .marcaciones__equipo-encabezado label { display: grid; gap: 6px; }
.marcaciones select, .marcaciones input { min-width: 100px; padding: 9px 11px; border: 1px solid rgba(255,255,255,.17); border-radius: 9px; color: #f8fafc; background: rgba(5,8,22,.74); font: inherit; }
.marcaciones select option { color: #f8fafc; background: #0f172a; }
.marcaciones__boton, .marcaciones__guardar { min-height: 40px; padding: 9px 13px; border: 1px solid rgba(255,255,255,.16); border-radius: 9px; color: #e2e8f0; background: rgba(255,255,255,.07); font: inherit; font-weight: 600; cursor: pointer; transition: transform .18s, filter .18s, border-color .18s; }
.marcaciones__boton--primario, .marcaciones__guardar { color: #fff; border-color: rgba(94,234,212,.3); background: linear-gradient(135deg,#0f766e,#2563eb); }
.marcaciones__boton:hover:not(:disabled), .marcaciones__guardar:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.1); }
.marcaciones button:disabled, .marcaciones input:disabled, .marcaciones select:disabled { opacity: .5; cursor: not-allowed; }
.marcaciones__tabla-scroll { max-width: 100%; overflow-x: auto; }
.marcaciones__tabla { width: 100%; border-collapse: collapse; text-align: left; }
.marcaciones__tabla th { padding: 10px; color: #cbd5e1; font-size: .78rem; white-space: nowrap; }
.marcaciones__tabla td { padding: 10px; border-top: 1px solid rgba(255,255,255,.09); color: #e2e8f0; font-size: .86rem; white-space: nowrap; }
.marcaciones__tabla--equipo { min-width: 940px; }
.marcaciones__tabla--equipo th, .marcaciones__tabla--equipo td { padding: 8px; }
.marcaciones__tabla--equipo select, .marcaciones__tabla--equipo input { min-width: 92px; padding: 7px; }
.marcaciones__tabla--equipo td:nth-child(6) input { min-width: 125px; }
.marcaciones__estado-actual { display: block; margin-top: 3px; color: #94a3b8; font-size: .72rem; }
.marcaciones__guardar { min-height: 34px; padding: 6px 10px; }
.marcaciones__vacio { color: var(--marcacion-suave); }
.marcaciones__mensaje { margin: 0 0 14px; padding: 11px 14px; border: 1px solid; border-radius: 10px; }
.marcaciones__mensaje--error { color: #fecaca; border-color: rgba(248,113,113,.3); background: rgba(127,29,29,.2); }
.marcaciones__mensaje--ok { color: #99f6e4; border-color: rgba(45,212,191,.3); background: rgba(13,148,136,.16); }
@media (max-width: 650px) {
  .marcaciones { padding: 22px 14px; }
  .marcaciones__horas { grid-template-columns: 1fr; }
  .marcaciones__equipo-encabezado { display: grid; gap: 14px; }
  .marcaciones__estado { align-self: flex-start; }
}
`;

export default Marcaciones;
