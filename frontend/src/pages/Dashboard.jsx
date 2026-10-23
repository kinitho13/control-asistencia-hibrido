import { useEffect, useMemo, useState } from "react";

const API_URL = "http://localhost:8000";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// "2026-10-20" o "2026-10-20T00:00:00" -> "2026-10-20" (sin desfase de zona horaria)
const claveFecha = (valor) => String(valor).slice(0, 10);

const formatearPorcentaje = (parte, total) =>
  total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;

function Dashboard() {
  const hoy = new Date();

  const [usuarios, setUsuarios] = useState([]);
  const [restricciones, setRestricciones] = useState([]);
  const [asistencias, setAsistencias] = useState([]);
  const [mes, setMes] = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // ---------- Carga de datos ----------
  useEffect(() => {
    const controlador = new AbortController();

    const cargar = async () => {
      try {
        setCargando(true);
        setError(null);

        const pedir = async (ruta) => {
          const res = await fetch(`${API_URL}${ruta}`, { signal: controlador.signal });
          if (!res.ok) throw new Error(`Error en ${ruta}`);
          return res.json();
        };

        const [dUsuarios, dRestricciones, dAsistencias] = await Promise.all([
          pedir("/usuarios"),
          pedir("/restricciones"),
          pedir("/calendario"),
        ]);

        setUsuarios(dUsuarios);
        setRestricciones(dRestricciones);
        setAsistencias(dAsistencias);
      } catch (e) {
        if (e.name !== "AbortError") {
          setError(`No se pudieron cargar los datos. Verifica que el servidor esté activo en ${API_URL}.`);
        }
      } finally {
        if (!controlador.signal.aborted) setCargando(false);
      }
    };

    cargar();
    return () => controlador.abort();
  }, []);

  // ---------- Datos derivados (del mes seleccionado) ----------
  const asistenciasDelMes = useMemo(() => {
    const prefijo = `${anio}-${String(mes + 1).padStart(2, "0")}`;
    return asistencias.filter((a) => claveFecha(a.fecha).startsWith(prefijo));
  }, [asistencias, mes, anio]);

  const { casa, oficina, total, porUsuario } = useMemo(() => {
    const acumulado = {};
    let casa = 0;
    let oficina = 0;

    asistenciasDelMes.forEach((a) => {
      if (!acumulado[a.usuario]) acumulado[a.usuario] = { casa: 0, oficina: 0 };

      if (a.modalidad === "CASA") {
        casa += 1;
        acumulado[a.usuario].casa += 1;
      } else if (a.modalidad === "OFICINA") {
        oficina += 1;
        acumulado[a.usuario].oficina += 1;
      }
    });

    const porUsuario = Object.entries(acumulado)
      .map(([nombre, v]) => ({ nombre, ...v, total: v.casa + v.oficina }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    return { casa, oficina, total: casa + oficina, porUsuario };
  }, [asistenciasDelMes]);

  const porcentajeCasa = formatearPorcentaje(casa, total);
  const porcentajeOficina = total > 0 ? Math.round((100 - porcentajeCasa) * 10) / 10 : 0;

  const fechaHoy = hoy.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const estadisticas = [
    { etiqueta: "Usuarios", valor: usuarios.length },
    { etiqueta: "Restricciones", valor: restricciones.length },
    { etiqueta: "Días en casa", valor: casa, color: "var(--casa)" },
    { etiqueta: "Días en oficina", valor: oficina, color: "var(--oficina)" },
    { etiqueta: "Trabajo remoto", valor: `${porcentajeCasa}%` },
  ];

  // ---------- Render ----------
  return (
    <div className="dashboard">
      <style>{estilos}</style>

      <header className="dashboard__encabezado">
        <div>
          <h1 className="dashboard__titulo">Panel de control</h1>
          <p className="dashboard__subtitulo">{fechaHoy}</p>
        </div>

        <div className="dashboard__controles">
          <label className="campo">
            <span>Mes</span>
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
              {MESES.map((nombre, i) => (
                <option key={nombre} value={i}>{nombre}</option>
              ))}
            </select>
          </label>

          <label className="campo">
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
      </header>

      {cargando && <p className="estado">Cargando datos…</p>}

      {error && <p className="estado estado--error" role="alert">{error}</p>}

      {!cargando && !error && (
        <>
          <section className="resumen" aria-label="Resumen">
            {estadisticas.map(({ etiqueta, valor, color }) => (
              <div className="resumen__item" key={etiqueta}>
                <span className="resumen__valor" style={color ? { color } : undefined}>
                  {valor}
                </span>
                <span className="resumen__etiqueta">{etiqueta}</span>
              </div>
            ))}
          </section>

          <section className="panel" aria-labelledby="titulo-distribucion">
            <h2 id="titulo-distribucion" className="panel__titulo">
              Distribución de {MESES[mes].toLowerCase()} de {anio}
            </h2>

            {total === 0 ? (
              <p className="vacio">No hay asistencias registradas en este mes. Prueba con otro mes.</p>
            ) : (
              <>
                <div
                  className="barra"
                  role="img"
                  aria-label={`${porcentajeCasa}% en casa y ${porcentajeOficina}% en oficina`}
                >
                  <div className="barra__tramo barra__tramo--casa" style={{ width: `${porcentajeCasa}%` }} />
                  <div className="barra__tramo barra__tramo--oficina" style={{ width: `${porcentajeOficina}%` }} />
                </div>

                <ul className="leyenda">
                  <li><span className="muestra muestra--casa" /> Casa: {casa} ({porcentajeCasa}%)</li>
                  <li><span className="muestra muestra--oficina" /> Oficina: {oficina} ({porcentajeOficina}%)</li>
                </ul>
              </>
            )}
          </section>

          {porUsuario.length > 0 && (
            <section className="panel" aria-labelledby="titulo-usuarios">
              <h2 id="titulo-usuarios" className="panel__titulo">Por persona</h2>

              <ul className="personas">
                {porUsuario.map((p) => (
                  <li className="persona" key={p.nombre}>
                    <span className="persona__nombre">{p.nombre}</span>

                    <div
                      className="barra barra--delgada"
                      role="img"
                      aria-label={`${p.nombre}: ${p.casa} días en casa y ${p.oficina} en oficina`}
                    >
                      <div
                        className="barra__tramo barra__tramo--casa"
                        style={{ width: `${formatearPorcentaje(p.casa, p.total)}%` }}
                      />
                      <div
                        className="barra__tramo barra__tramo--oficina"
                        style={{ width: `${formatearPorcentaje(p.oficina, p.total)}%` }}
                      />
                    </div>

                    <span className="persona__cifras">
                      {p.casa} casa · {p.oficina} oficina
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const estilos = `
.dashboard {
  --tinta: #1e293b;
  --tinta-suave: #64748b;
  --linea: #e2e8f0;
  --fondo: #f8fafc;
  --superficie: #ffffff;
  --casa: #0f9d7a;
  --oficina: #3b5bdb;
  --primario: #3b5bdb;

  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  color: var(--tinta);
  background: var(--fondo);
  padding: 32px clamp(16px, 4vw, 48px);
  min-height: 100vh;
  box-sizing: border-box;
}

.dashboard__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.dashboard__titulo {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.dashboard__subtitulo {
  margin: 4px 0 0;
  color: var(--tinta-suave);
  font-size: 0.95rem;
  text-transform: capitalize;
}

.dashboard__controles { display: flex; gap: 12px; }

.campo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.8rem;
  color: var(--tinta-suave);
}

.campo select,
.campo input {
  font: inherit;
  font-size: 0.95rem;
  color: var(--tinta);
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: 8px;
  padding: 8px 12px;
  min-width: 110px;
}
.campo input { min-width: 84px; width: 84px; }

.campo select:focus-visible,
.campo input:focus-visible {
  outline: 2px solid var(--primario);
  outline-offset: 1px;
}

.estado {
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: 12px;
  padding: 24px;
  color: var(--tinta-suave);
}
.estado--error { color: #9f1239; background: #fff1f2; border-color: #fecdd3; }

.resumen {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: 12px;
  margin-bottom: 20px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.resumen__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px 24px;
  border-right: 1px solid var(--linea);
  border-bottom: 1px solid var(--linea);
  margin: 0 -1px -1px 0;
}

.resumen__valor {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.resumen__etiqueta { font-size: 0.85rem; color: var(--tinta-suave); }

.panel {
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.panel__titulo { margin: 0 0 16px; font-size: 1.05rem; font-weight: 600; }
.vacio { margin: 0; color: var(--tinta-suave); }

.barra {
  display: flex;
  height: 20px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--linea);
}
.barra--delgada { height: 10px; }
.barra__tramo { transition: width 0.3s ease; }
.barra__tramo--casa { background: var(--casa); }
.barra__tramo--oficina { background: var(--oficina); }

.leyenda {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  font-size: 0.9rem;
  color: var(--tinta-suave);
}
.leyenda li { display: flex; align-items: center; gap: 8px; }

.muestra { width: 14px; height: 14px; border-radius: 4px; display: inline-block; }
.muestra--casa { background: var(--casa); }
.muestra--oficina { background: var(--oficina); }

.personas { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }

.persona {
  display: grid;
  grid-template-columns: minmax(110px, 180px) 1fr minmax(130px, auto);
  align-items: center;
  gap: 16px;
  font-size: 0.9rem;
}
.persona__nombre { font-weight: 600; }
.persona__cifras { color: var(--tinta-suave); text-align: right; font-variant-numeric: tabular-nums; }

@media (max-width: 640px) {
  .persona { grid-template-columns: 1fr; gap: 6px; }
  .persona__cifras { text-align: left; }
}
`;

export default Dashboard;