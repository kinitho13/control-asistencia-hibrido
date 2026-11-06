import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../config";

function usuarioActual() {
  try {
    return JSON.parse(localStorage.getItem("usuario") || "null");
  } catch {
    return null;
  }
}

function Notificaciones() {
  const usuario = usuarioActual();
  const [notificaciones, setNotificaciones] = useState([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const respuesta = await apiFetch(`/notificaciones?usuario_id=${usuario.id}`);
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos?.detail || "No se pudieron cargar las notificaciones.");
    setNotificaciones(datos);
  }, [usuario?.id]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message)).finally(() => setCargando(false));
  }, [cargar]);

  const marcarLeida = async (id) => {
    const respuesta = await apiFetch(`/notificaciones/${id}/leer?usuario_id=${usuario.id}`, { method: "POST" });
    if (!respuesta.ok) {
      const datos = await respuesta.json().catch(() => null);
      setError(datos?.detail || "No se pudo actualizar la notificación.");
      return;
    }
    setNotificaciones((actuales) => actuales.map((aviso) => aviso.id === id ? { ...aviso, leida: true } : aviso));
  };

  const marcarTodas = async () => {
    const respuesta = await apiFetch(`/notificaciones/leer-todas?usuario_id=${usuario.id}`, { method: "POST" });
    if (!respuesta.ok) {
      const datos = await respuesta.json().catch(() => null);
      setError(datos?.detail || "No se pudieron marcar como leídas.");
      return;
    }
    setNotificaciones((actuales) => actuales.map((aviso) => ({ ...aviso, leida: true })));
  };

  return (
    <main className="notificaciones">
      <style>{estilos}</style>
      <header>
        <div><p className="notificaciones__eyebrow">AVISOS DEL SISTEMA</p><h1>Notificaciones</h1></div>
        <button onClick={marcarTodas} disabled={!notificaciones.some((n) => !n.leida)}>Marcar todas como leídas</button>
      </header>
      {error && <p className="notificaciones__error" role="alert">{error}</p>}
      {cargando ? <p>Cargando…</p> : notificaciones.length === 0 ? (
        <p className="notificaciones__vacia">No tienes notificaciones.</p>
      ) : (
        <section className="notificaciones__lista">
          {notificaciones.map((aviso) => (
            <article key={aviso.id} className={`notificaciones__item${aviso.leida ? "" : " no-leida"}`}>
              <div><p>{aviso.mensaje}</p><time>{new Date(aviso.creada_en).toLocaleString("es-CO")}</time></div>
              {!aviso.leida && <button onClick={() => marcarLeida(aviso.id)}>Marcar leída</button>}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

const estilos = `
.notificaciones { min-height:100vh; padding:clamp(20px,4vw,42px); color:#f8fafc; background:linear-gradient(135deg,#030712,#050816 55%,#111827); font-family:var(--sans); }
.notificaciones header { display:flex; justify-content:space-between; align-items:center; gap:16px; max-width:900px; margin:0 auto 24px; }
.notificaciones__eyebrow { color:#94a3b8; font-size:.72rem; font-weight:700; letter-spacing:.18em; }
.notificaciones h1 { margin:0; font-size:clamp(1.7rem,4vw,2.3rem); }
.notificaciones button { border:1px solid rgba(255,255,255,.16); border-radius:8px; padding:9px 12px; color:#f8fafc; background:#334155; font:inherit; cursor:pointer; }
.notificaciones button:disabled { opacity:.45; cursor:not-allowed; }
.notificaciones__lista { display:grid; max-width:900px; margin:auto; gap:10px; }
.notificaciones__item { display:flex; justify-content:space-between; align-items:center; gap:14px; padding:16px; border:1px solid rgba(255,255,255,.1); border-radius:12px; background:rgba(255,255,255,.04); }
.notificaciones__item.no-leida { border-color:rgba(147,197,253,.45); background:rgba(59,130,246,.1); }
.notificaciones__item p { margin:0 0 6px; }
.notificaciones__item time { color:#94a3b8; font-size:.82rem; }
.notificaciones__vacia,.notificaciones__error { max-width:900px; margin:20px auto; color:#cbd5e1; }
`;

export default Notificaciones;
