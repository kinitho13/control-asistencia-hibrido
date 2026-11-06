import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../config";

function usuarioActual() {
  try {
    return JSON.parse(localStorage.getItem("usuario") || "null");
  } catch {
    return null;
  }
}

function mostrarFecha(evento) {
  if (evento.fecha_es_actividad) {
    const [anio, mes, dia] = evento.creada_en.split("-").map(Number);
    return new Date(anio, mes - 1, dia).toLocaleDateString("es-CO");
  }
  return new Date(evento.creada_en).toLocaleString("es-CO");
}

function Auditoria() {
  const usuario = usuarioActual();
  const [eventos, setEventos] = useState([]);
  const [filtros, setFiltros] = useState({ entidad: "", desde: "", hasta: "" });
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    const parametros = new URLSearchParams({ usuario_id: usuario.id });
    Object.entries(filtros).forEach(([clave, valor]) => valor && parametros.set(clave, valor));
    try {
      const respuesta = await apiFetch(`/auditoria?${parametros}`);
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos?.detail || "No se pudo consultar el historial.");
      setEventos(datos);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [usuario?.id, filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <main className="auditoria">
      <style>{estilos}</style>
      <header><p className="auditoria__eyebrow">TRAZABILIDAD</p><h1>Historial de cambios</h1><p>Registro de solicitudes, asistencias, cierres y cambios administrativos.</p></header>
      <section className="auditoria__filtros">
        <label>Tipo de elemento
          <select value={filtros.entidad} onChange={(e) => setFiltros({ ...filtros, entidad: e.target.value })}>
            <option value="">Todos</option><option value="asistencia">Asistencias</option><option value="solicitud">Solicitudes</option><option value="usuario">Usuarios</option><option value="cierre">Cierres</option><option value="festivo">Festivos</option>
          </select>
        </label>
        <label>Desde<input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} /></label>
        <label>Hasta<input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} /></label>
        <button onClick={cargar} disabled={cargando}>{cargando ? "Actualizando…" : "Actualizar"}</button>
      </section>
      {error && <p className="auditoria__error" role="alert">{error}</p>}
      <section className="auditoria__lista">
        {cargando ? <p>Cargando historial…</p> : eventos.length === 0 ? <p>No hay cambios para estos filtros.</p> : (
          <div className="auditoria__tabla">
            <div className="auditoria__fila auditoria__fila--titulo"><span>Fecha</span><span>Actor</span><span>Acción</span><span>Detalle</span></div>
            {eventos.map((evento) => (
              <article className="auditoria__fila" key={evento.id}>
                <time dateTime={evento.creada_en}>{mostrarFecha(evento)}</time>
                <strong>{evento.actor}</strong>
                <span>{evento.accion} · {evento.entidad}</span>
                <span>{evento.detalle}</span>
              </article>
            ))}
          </div>
        )}
        {!cargando && eventos.length >= 500 && <p>Se muestran los 500 eventos más recientes; aplica filtros para acotar la búsqueda.</p>}
      </section>
    </main>
  );
}

const estilos = `
.auditoria { min-height:100vh; padding:clamp(20px,4vw,42px); color:#f8fafc; background:linear-gradient(135deg,#030712,#050816 55%,#111827); font-family:var(--sans); }
.auditoria header,.auditoria__filtros,.auditoria__lista { max-width:1100px; margin:0 auto 20px; }
.auditoria__eyebrow { color:#94a3b8; font-size:.72rem; font-weight:700; letter-spacing:.18em; }
.auditoria h1 { margin:0; font-size:clamp(1.7rem,4vw,2.3rem); }.auditoria header p:last-child { color:#b8c1d9; }
.auditoria__filtros { display:flex; flex-wrap:wrap; align-items:end; gap:12px; padding:16px; border:1px solid rgba(255,255,255,.13); border-radius:12px; background:rgba(255,255,255,.055); }
.auditoria label { display:grid; gap:5px; color:#cbd5e1; font-size:.82rem; }.auditoria input,.auditoria select { padding:8px; border:1px solid rgba(255,255,255,.16); border-radius:7px; color:#f8fafc; background:#0b1222; font:inherit; }
.auditoria button { padding:9px 12px; border:1px solid #64748b; border-radius:8px; color:#fff; background:#334155; font:inherit; cursor:pointer; }
.auditoria__lista { padding:16px; border:1px solid rgba(255,255,255,.13); border-radius:12px; background:rgba(255,255,255,.04); overflow:auto; }
.auditoria__tabla { min-width:760px; }.auditoria__fila { display:grid; grid-template-columns:170px 150px 150px minmax(250px,1fr); gap:12px; padding:11px 8px; border-bottom:1px solid rgba(255,255,255,.09); font-size:.88rem; }
.auditoria__fila--titulo { color:#cbd5e1; font-weight:700; }.auditoria time { color:#b8c1d9; }.auditoria__error { color:#fecaca; }
@media(max-width:800px) {.auditoria__fila:not(.auditoria__fila--titulo) { grid-template-columns:160px 120px 130px minmax(200px,1fr); }}
`;

export default Auditoria;
