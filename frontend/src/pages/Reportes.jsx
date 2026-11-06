import { useCallback, useEffect, useMemo, useState } from "react";
import Exportaciones from "../components/Exportaciones";
import { apiFetch } from "../config";

const hoy = new Date();
const fechaISO = (fecha) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;

function usuarioActual() {
  try {
    return JSON.parse(localStorage.getItem("usuario") || "null");
  } catch {
    return null;
  }
}

function Reportes() {
  const usuario = usuarioActual();
  const [usuarios, setUsuarios] = useState([]);
  const [filtros, setFiltros] = useState({
    desde: fechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    hasta: fechaISO(hoy),
    persona_id: "",
  });
  const [registros, setRegistros] = useState([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    const parametros = new URLSearchParams({ usuario_id: usuario.id });
    Object.entries(filtros).forEach(([clave, valor]) => valor && parametros.set(clave, valor));
    try {
      const respuesta = await apiFetch(`/reportes/asistencias?${parametros}`);
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos?.detail || "No se pudo generar el reporte.");
      setRegistros(datos);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [usuario?.id, filtros]);

  useEffect(() => {
    apiFetch("/usuarios")
      .then((respuesta) => respuesta.json().then((datos) => {
        if (!respuesta.ok) throw new Error(datos?.detail || "No se pudieron cargar los usuarios.");
        setUsuarios(datos);
      }))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const resumen = useMemo(() => registros.reduce((total, registro) => {
    total[registro.modalidad === "CASA" ? "casa" : "oficina"] += 1;
    return total;
  }, { casa: 0, oficina: 0 }), [registros]);

  const filas = registros.map((registro) => ({
    Fecha: String(registro.fecha).slice(0, 10),
    Persona: registro.usuario,
    Modalidad: registro.modalidad,
  }));

  return (
    <main className="reportes">
      <style>{estilos}</style>
      <header><p className="reportes__eyebrow">ANÁLISIS Y EXPORTACIÓN</p><h1>Reportes de asistencia</h1><p>Filtra por rango de fechas y persona; consulta los totales y descarga o imprime el resultado.</p></header>
      <section className="reportes__filtros">
        <label>Desde<input type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} /></label>
        <label>Hasta<input type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} /></label>
        <label>Persona<select value={filtros.persona_id} onChange={(e) => setFiltros({ ...filtros, persona_id: e.target.value })}>
          <option value="">Todas las personas</option>
          {usuarios.map((persona) => <option key={persona.id} value={persona.id}>{persona.nombre}</option>)}
        </select></label>
        <button onClick={cargar} disabled={cargando}>{cargando ? "Generando…" : "Actualizar reporte"}</button>
      </section>
      {error && <p className="reportes__error" role="alert">{error}</p>}
      <section className="reportes__resumen" aria-label="Totales del reporte">
        <article><strong>{registros.length}</strong><span>Asignaciones</span></article>
        <article><strong>{resumen.casa}</strong><span>Días en casa</span></article>
        <article><strong>{resumen.oficina}</strong><span>Días en oficina</span></article>
      </section>
      <section id="reporte-exportable" className="reportes__resultado">
        <div className="reportes__titulo-tabla">
          <div><h2>Detalle</h2><span>{filtros.desde} — {filtros.hasta}</span></div>
          <Exportaciones nombreArchivo="reporte-asistencia" nombreHoja="Asistencias" tituloPdf="Reporte de asistencia" filas={filas} />
        </div>
        {cargando ? <p>Cargando reporte…</p> : filas.length === 0 ? <p>No hay asistencias para los filtros seleccionados.</p> : (
          <div className="reportes__tabla-scroll">
            <table><thead><tr><th>Fecha</th><th>Persona</th><th>Modalidad</th></tr></thead>
              <tbody>{registros.map((registro) => <tr key={registro.id}><td>{String(registro.fecha).slice(0, 10)}</td><td>{registro.usuario}</td><td>{registro.modalidad}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

const estilos = `
.reportes { min-height:100vh; padding:clamp(20px,4vw,42px); color:#f8fafc; background:linear-gradient(135deg,#030712,#050816 55%,#111827); font-family:var(--sans); }
.reportes header,.reportes__filtros,.reportes__resumen,.reportes__resultado { max-width:1100px; margin:0 auto 18px; }
.reportes__eyebrow { color:#94a3b8; font-size:.72rem; font-weight:700; letter-spacing:.18em; }.reportes h1 { margin:0; font-size:clamp(1.7rem,4vw,2.3rem); }.reportes header p:last-child { color:#b8c1d9; }
.reportes__filtros { display:flex; flex-wrap:wrap; align-items:end; gap:12px; padding:16px; border:1px solid rgba(255,255,255,.13); border-radius:12px; background:rgba(255,255,255,.055); }
.reportes label { display:grid; gap:5px; color:#cbd5e1; font-size:.82rem; }.reportes input,.reportes select { padding:9px; border:1px solid rgba(255,255,255,.16); border-radius:7px; color:#f8fafc; background:#0b1222; font:inherit; }
.reportes__filtros button { padding:9px 12px; border:1px solid #64748b; border-radius:8px; color:#fff; background:#334155; font:inherit; cursor:pointer; }
.reportes__resumen { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }.reportes__resumen article { display:grid; gap:5px; padding:16px; border:1px solid rgba(255,255,255,.13); border-radius:12px; background:rgba(255,255,255,.055); }.reportes__resumen strong { font-size:1.5rem; }.reportes__resumen span { color:#b8c1d9; }
.reportes__resultado { padding:18px; border:1px solid rgba(255,255,255,.13); border-radius:12px; background:rgba(255,255,255,.04); }.reportes__titulo-tabla { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; }.reportes__titulo-tabla h2 { margin:0 0 4px; }.reportes__titulo-tabla span { color:#b8c1d9; font-size:.85rem; }
.reportes__tabla-scroll { overflow:auto; } .reportes table { width:100%; border-collapse:collapse; text-align:left; }.reportes th,.reportes td { padding:10px; border-bottom:1px solid rgba(255,255,255,.1); }.reportes th { color:#cbd5e1; }.reportes__error { color:#fecaca; }
@media print { .reportes { color:#111827; background:white; } .reportes__resultado { border:0; background:white; } .reportes th,.reportes td { border-color:#cbd5e1; } .reportes__titulo-tabla span { color:#475569; } }
@media(max-width:500px) { .reportes__resumen { grid-template-columns:1fr; } }
`;

export default Reportes;
