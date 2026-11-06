import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../config";

const obtenerUsuario = () => {
  try {
    return JSON.parse(localStorage.getItem("usuario") || "null");
  } catch {
    return null;
  }
};

async function pedir(ruta, opciones = {}) {
  const respuesta = await apiFetch(ruta, {
    headers: { "Content-Type": "application/json" },
    ...opciones,
  });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new Error(datos?.detail || `Error ${respuesta.status} del servidor.`);
  }
  return datos;
}

function Solicitudes() {
  const usuario = obtenerUsuario();
  const esRevisor = ["ADMIN", "LIDER"].includes(usuario?.rol?.toUpperCase());
  const [solicitudes, setSolicitudes] = useState([]);
  const [suplentes, setSuplentes] = useState([]);
  const [formulario, setFormulario] = useState({
    tipo: "CAMBIO_MODALIDAD",
    fecha: "",
    modalidad: "CASA",
    suplente_id: "",
    motivo: "",
  });
  const [respuesta, setRespuesta] = useState({});
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!usuario?.id) return;
    const [lista, externos] = await Promise.all([
      pedir(`/solicitudes?usuario_id=${usuario.id}`),
      pedir("/suplentes"),
    ]);
    setSolicitudes(lista);
    setSuplentes(externos);
  }, [usuario?.id]);

  useEffect(() => {
    cargar()
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [cargar]);

  const crear = async (evento) => {
    evento.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await pedir("/solicitudes", {
        method: "POST",
        body: JSON.stringify({
          usuario_id: usuario.id,
          tipo: formulario.tipo,
          fecha: formulario.fecha,
          modalidad: formulario.tipo === "CAMBIO_MODALIDAD" ? formulario.modalidad : null,
          suplente_id: formulario.tipo === "REEMPLAZO" ? Number(formulario.suplente_id) : null,
          motivo: formulario.motivo,
        }),
      });
      setFormulario({ ...formulario, fecha: "", suplente_id: "", motivo: "" });
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const resolver = async (solicitud, aprobar) => {
    setError("");
    setGuardando(true);
    try {
      await pedir(`/solicitudes/${solicitud.id}/resolver`, {
        method: "POST",
        body: JSON.stringify({
          revisor_id: usuario.id,
          aprobar,
          respuesta: respuesta[solicitud.id] || null,
        }),
      });
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <main className="solicitudes">
      <style>{estilos}</style>
      <header>
        <p className="solicitudes__eyebrow">GESTIÓN DE EQUIPO</p>
        <h1>Solicitudes</h1>
        <p>Solicita un cambio de modalidad, reporta una ausencia o pide un reemplazo. Las decisiones quedan registradas.</p>
      </header>

      {error && <p className="solicitudes__alerta" role="alert">{error}</p>}

      <form className="solicitudes__form" onSubmit={crear}>
        <h2>Nueva solicitud</h2>
        <div className="solicitudes__campos">
          <label>Tipo
            <select value={formulario.tipo} onChange={(e) => setFormulario({ ...formulario, tipo: e.target.value })}>
              <option value="CAMBIO_MODALIDAD">Cambio de modalidad</option>
              <option value="AUSENCIA">Justificar ausencia</option>
              <option value="REEMPLAZO">Solicitar reemplazo</option>
            </select>
          </label>
          <label>Fecha
            <input type="date" required value={formulario.fecha} onChange={(e) => setFormulario({ ...formulario, fecha: e.target.value })} />
          </label>
          {formulario.tipo === "CAMBIO_MODALIDAD" && (
            <label>Modalidad solicitada
              <select value={formulario.modalidad} onChange={(e) => setFormulario({ ...formulario, modalidad: e.target.value })}>
                <option value="CASA">Casa</option><option value="OFICINA">Oficina</option>
              </select>
            </label>
          )}
          {formulario.tipo === "REEMPLAZO" && (
            <label>Persona suplente
              <select required value={formulario.suplente_id} onChange={(e) => setFormulario({ ...formulario, suplente_id: e.target.value })}>
                <option value="">Selecciona una persona</option>
                {suplentes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </label>
          )}
          <label className="solicitudes__motivo">Motivo
            <textarea required minLength="3" maxLength="2000" value={formulario.motivo} onChange={(e) => setFormulario({ ...formulario, motivo: e.target.value })} />
          </label>
        </div>
        <button disabled={guardando}>{guardando ? "Enviando…" : "Enviar solicitud"}</button>
      </form>

      <section className="solicitudes__lista">
        <h2>{esRevisor ? "Solicitudes del equipo" : "Mis solicitudes"}</h2>
        {cargando ? <p>Cargando solicitudes…</p> : solicitudes.length === 0 ? (
          <p>No hay solicitudes registradas todavía.</p>
        ) : (
          <div className="solicitudes__tabla">
            {solicitudes.map((solicitud) => (
              <article className="solicitudes__item" key={solicitud.id}>
                <div className="solicitudes__datos">
                  <strong>{solicitud.usuario} · {solicitud.tipo.replaceAll("_", " ")}</strong>
                  <span>{String(solicitud.fecha).slice(0, 10)}{solicitud.modalidad ? ` · ${solicitud.modalidad}` : ""}{solicitud.suplente ? ` · suplente: ${solicitud.suplente}` : ""}</span>
                  <p>{solicitud.motivo}</p>
                  <span className={`solicitudes__estado solicitudes__estado--${solicitud.estado.toLowerCase()}`}>{solicitud.estado}</span>
                  {solicitud.respuesta && <p><b>Respuesta:</b> {solicitud.respuesta}</p>}
                  {solicitud.revisada_por && <small>Revisó {solicitud.revisada_por}</small>}
                </div>
                {esRevisor && solicitud.estado === "PENDIENTE" && (
                  <div className="solicitudes__acciones">
                    <input
                      aria-label={`Respuesta para solicitud ${solicitud.id}`}
                      placeholder="Respuesta opcional"
                      value={respuesta[solicitud.id] || ""}
                      onChange={(e) => setRespuesta({ ...respuesta, [solicitud.id]: e.target.value })}
                    />
                    <button disabled={guardando} onClick={() => resolver(solicitud, true)}>Aprobar</button>
                    <button className="solicitudes__rechazar" disabled={guardando} onClick={() => resolver(solicitud, false)}>Rechazar</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const estilos = `
.solicitudes { min-height: 100vh; padding: clamp(20px,4vw,42px); color: #f8fafc; background: linear-gradient(135deg,#030712,#050816 55%,#111827); font-family: var(--sans); }
.solicitudes header { max-width: 900px; margin: 0 auto 24px; }
.solicitudes__eyebrow { color:#94a3b8; font-size:.72rem; font-weight:700; letter-spacing:.18em; }
.solicitudes h1 { margin:0; font-size:clamp(1.7rem,4vw,2.3rem); }
.solicitudes header p:last-child { color:#b8c1d9; }
.solicitudes__form,.solicitudes__lista { max-width:900px; margin:18px auto; padding:22px; border:1px solid rgba(255,255,255,.13); border-radius:16px; background:rgba(255,255,255,.055); }
.solicitudes h2 { margin:0 0 16px; font-size:1.1rem; }
.solicitudes__campos { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px; }
.solicitudes label { display:grid; gap:6px; color:#cbd5e1; font-size:.85rem; font-weight:600; }
.solicitudes input,.solicitudes select,.solicitudes textarea { width:100%; box-sizing:border-box; padding:10px; border:1px solid rgba(255,255,255,.16); border-radius:8px; color:#f8fafc; background:#0b1222; font:inherit; }
.solicitudes textarea { min-height:76px; resize:vertical; }
.solicitudes__motivo { grid-column:1/-1; }
.solicitudes button { border:1px solid #64748b; border-radius:8px; padding:9px 13px; color:#fff; background:#334155; font:inherit; font-weight:650; cursor:pointer; }
.solicitudes__form > button { margin-top:14px; }
.solicitudes button:disabled { opacity:.55; cursor:wait; }
.solicitudes__tabla { display:grid; gap:12px; }
.solicitudes__item { display:flex; justify-content:space-between; gap:18px; padding:16px; border:1px solid rgba(255,255,255,.1); border-radius:12px; background:rgba(15,23,42,.7); }
.solicitudes__datos { display:grid; gap:6px; }
.solicitudes__datos span,.solicitudes__datos small { color:#b8c1d9; }
.solicitudes__datos p { margin:2px 0; }
.solicitudes__estado { width:max-content; padding:4px 8px; border-radius:999px; font-size:.74rem; font-weight:700; }
.solicitudes__estado--pendiente { color:#fde68a!important; background:rgba(234,179,8,.15); }
.solicitudes__estado--aprobada { color:#86efac!important; background:rgba(34,197,94,.15); }
.solicitudes__estado--rechazada { color:#fda4af!important; background:rgba(244,63,94,.15); }
.solicitudes__acciones { display:grid; align-content:center; gap:8px; min-width:min(220px,35%); }
.solicitudes__rechazar { background:#7f1d1d!important; border-color:#991b1b!important; }
.solicitudes__alerta { max-width:900px; margin:12px auto; color:#fecaca; }
@media(max-width:650px) { .solicitudes__item { flex-direction:column; } .solicitudes__acciones { min-width:0; } }
`;

export default Solicitudes;
