import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../config";

function usuarioActual() {
  try {
    return JSON.parse(localStorage.getItem("usuario") || "null");
  } catch {
    return null;
  }
}

function Cierres() {
  const usuario = usuarioActual();
  const [cierres, setCierres] = useState([]);
  const [formulario, setFormulario] = useState({ fecha_inicio: "", fecha_fin: "", descripcion: "" });
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const respuesta = await apiFetch("/cierres");
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos?.detail || "No se pudieron cargar los cierres.");
    setCierres(datos);
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  const crear = async (evento) => {
    evento.preventDefault();
    setError("");
    setMensaje("");
    setGuardando(true);
    try {
      const respuesta = await apiFetch("/cierres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formulario, actor_id: usuario.id }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos?.detail || "No se pudo registrar el cierre.");
      setFormulario({ fecha_inicio: "", fecha_fin: "", descripcion: "" });
      setMensaje("Cierre registrado; el generador y las validaciones lo respetarán.");
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (cierre) => {
    if (!window.confirm(`¿Eliminar el cierre "${cierre.descripcion}"?`)) return;
    setError("");
    try {
      const respuesta = await apiFetch(`/cierres/${cierre.id}?actor_id=${usuario.id}`, { method: "DELETE" });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos?.detail || "No se pudo eliminar el cierre.");
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <main className="cierres">
      <style>{estilos}</style>
      <header><p className="cierres__eyebrow">CALENDARIO LABORAL</p><h1>Cierres de oficina</h1><p>Define días o rangos en los que no se debe programar asistencia presencial.</p></header>
      {error && <p className="cierres__error" role="alert">{error}</p>}
      {mensaje && <p className="cierres__ok" role="status">{mensaje}</p>}
      <form className="cierres__form" onSubmit={crear}>
        <h2>Registrar cierre</h2>
        <div className="cierres__campos">
          <label>Desde<input required type="date" value={formulario.fecha_inicio} onChange={(e) => setFormulario({ ...formulario, fecha_inicio: e.target.value })} /></label>
          <label>Hasta<input required type="date" min={formulario.fecha_inicio || undefined} value={formulario.fecha_fin} onChange={(e) => setFormulario({ ...formulario, fecha_fin: e.target.value })} /></label>
          <label>Motivo<input required maxLength="200" value={formulario.descripcion} onChange={(e) => setFormulario({ ...formulario, descripcion: e.target.value })} placeholder="Ej. Mantenimiento de sede" /></label>
        </div>
        <button disabled={guardando}>{guardando ? "Guardando…" : "Guardar cierre"}</button>
      </form>
      <section className="cierres__lista">
        <h2>Cierres registrados</h2>
        {cierres.length === 0 ? <p>No hay cierres registrados.</p> : cierres.map((cierre) => (
          <article key={cierre.id}>
            <div><strong>{cierre.descripcion}</strong><span>{String(cierre.fecha_inicio).slice(0, 10)}{cierre.fecha_fin !== cierre.fecha_inicio ? ` al ${String(cierre.fecha_fin).slice(0, 10)}` : ""}</span></div>
            <button className="cierres__eliminar" onClick={() => eliminar(cierre)}>Eliminar</button>
          </article>
        ))}
      </section>
    </main>
  );
}

const estilos = `
.cierres { min-height:100vh; padding:clamp(20px,4vw,42px); color:#f8fafc; background:linear-gradient(135deg,#030712,#050816 55%,#111827); font-family:var(--sans); }
.cierres header,.cierres__form,.cierres__lista { max-width:900px; margin:0 auto 20px; }
.cierres__eyebrow { color:#94a3b8; font-size:.72rem; font-weight:700; letter-spacing:.18em; }
.cierres h1 { margin:0; font-size:clamp(1.7rem,4vw,2.3rem); }
.cierres header p:last-child { color:#b8c1d9; }
.cierres__form,.cierres__lista { padding:22px; border:1px solid rgba(255,255,255,.13); border-radius:16px; background:rgba(255,255,255,.055); }
.cierres h2 { margin:0 0 16px; font-size:1.1rem; }
.cierres__campos { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px; }
.cierres label { display:grid; gap:6px; color:#cbd5e1; font-size:.85rem; font-weight:600; }
.cierres input { box-sizing:border-box; width:100%; padding:10px; border:1px solid rgba(255,255,255,.16); border-radius:8px; color:#f8fafc; background:#0b1222; font:inherit; }
.cierres button { margin-top:14px; border:1px solid #64748b; border-radius:8px; padding:9px 13px; color:#fff; background:#334155; font:inherit; cursor:pointer; }
.cierres__lista article { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:14px 0; border-bottom:1px solid rgba(255,255,255,.1); }
.cierres__lista article:last-child { border-bottom:0; }
.cierres__lista article div { display:grid; gap:5px; }.cierres__lista article span { color:#b8c1d9; }
.cierres .cierres__eliminar { margin:0; background:#7f1d1d; border-color:#991b1b; }
.cierres__error { color:#fecaca; }.cierres__ok { color:#bbf7d0; }
`;

export default Cierres;
