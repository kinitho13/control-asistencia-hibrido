import { useEffect, useMemo, useState } from "react";

const API_URL = "http://localhost:8000";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const MODALIDADES = {
  CASA: { letra: "CA", etiqueta: "Casa", clase: "casa" },
  OFICINA: { letra: "OF", etiqueta: "Oficina", clase: "oficina" },
};

/**
 * Convierte una fecha de la API ("2026-10-20" o "2026-10-20T00:00:00")
 * en una clave "YYYY-MM-DD" sin pasar por new Date().
 * Así se evita el desfase de un día por la zona horaria (UTC vs Colombia).
 */
const claveFecha = (valor) => String(valor).slice(0, 10);

const construirClave = (anio, mes, dia) =>
  `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

function Gantt() {
  const hoy = new Date();

  const [datos, setDatos] = useState([]);
  const [festivos, setFestivos] = useState([]);
  const [reemplazos, setReemplazos] = useState([]);
  const [mes, setMes] = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // ---------- Carga de datos ----------
  useEffect(() => {
fetch("http://localhost:8000/calendario")
    .then((r) => r.json())
    .then((data) => setDatos(data));

  fetch("http://localhost:8000/festivos")
    .then((r) => r.json())
    .then((data) => setFestivos(data));


    const controlador = new AbortController();

    const cargar = async () => {
      try {
        setCargando(true);
        setError(null);

        const [
  resCalendario,
  resFestivos,
  resReemplazos
] = await Promise.all([
  fetch(`${API_URL}/calendario`, { signal: controlador.signal }),
  fetch(`${API_URL}/festivos`, { signal: controlador.signal }),
  fetch(`${API_URL}/reemplazos/todos`, { signal: controlador.signal }),
]);

        if (!resCalendario.ok || !resFestivos.ok || !resReemplazos.ok) {
          throw new Error("El servidor respondió con un error.");
        }

        setDatos(await resCalendario.json());
        setFestivos(await resFestivos.json());
        setReemplazos(await resReemplazos.json());
      } catch (e) {
        if (e.name !== "AbortError") {
          setError("No se pudo cargar el cronograma. Verifica que el servidor esté activo en " + API_URL);
        }
      } finally {
        if (!controlador.signal.aborted) setCargando(false);
      }
    };

    cargar();
    return () => controlador.abort();
  }, []);

  // ---------- Datos derivados ----------
  const diasDelMes = useMemo(() => {
    const cantidad = new Date(anio, mes + 1, 0).getDate();
    return Array.from({ length: cantidad }, (_, i) => {
      const dia = i + 1;
      const fecha = new Date(anio, mes, dia);
      return {
        dia,
        clave: construirClave(anio, mes, dia),
        diaSemana: fecha.getDay(),
      };
    });
  }, [mes, anio]);

  const setFestivosClaves = useMemo(
    () => new Set(festivos.map((f) => claveFecha(f.fecha))),
    [festivos]
  );
  const reemplazosMapa = useMemo(() => {

  const mapa = {};

  reemplazos.forEach((r) => {

    mapa[
      `${claveFecha(r.fecha)}-${r.usuario}`
    ] = r;

  });

  return mapa;

}, [reemplazos]);

  // { usuario: { "2026-10-20": "CASA", ... } }
  const calendarioPorUsuario = useMemo(() => {
    const prefijo = `${anio}-${String(mes + 1).padStart(2, "0")}`;
    const resultado = {};

    datos.forEach((d) => {
      const clave = claveFecha(d.fecha);
      if (!clave.startsWith(prefijo)) return;
      if (!resultado[d.usuario]) resultado[d.usuario] = {};
      resultado[d.usuario][clave] = d.modalidad;
    });

    return resultado;
  }, [datos, mes, anio]);

  const usuarios = useMemo(
    () => Object.keys(calendarioPorUsuario).sort((a, b) => a.localeCompare(b, "es")),
    [calendarioPorUsuario]
  );

  const claveHoy = construirClave(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const contarModalidad = (usuario, modalidad) =>
    Object.values(calendarioPorUsuario[usuario] || {}).filter((m) => m === modalidad).length;

  // ---------- Render ----------
  return (
    <div className="gantt">
      <style>{estilos}</style>

      <header className="gantt__encabezado">
        <div>
          <h1 className="gantt__titulo">Cronograma mensual</h1>
          <p>
  Festivos cargados: {festivos.length}
</p>
          <p className="gantt__subtitulo">
            Modalidad de trabajo por persona en {MESES[mes].toLowerCase()} de {anio}
          </p>
        </div>

        <div className="gantt__controles">
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

      <ul className="leyenda" aria-label="Leyenda">
        <li><span className="muestra muestra--casa" /> Casa</li>
        <li><span className="muestra muestra--oficina" /> Oficina</li>
        <li><span className="muestra muestra--festivo" /> Festivo</li>
        <li><span className="muestra muestra--finde" /> Fin de semana</li>
      </ul>

      {cargando && <p className="estado">Cargando cronograma…</p>}

      {error && (
        <p className="estado estado--error" role="alert">{error}</p>
      )}

      {!cargando && !error && usuarios.length === 0 && (
        <p className="estado">No hay registros para {MESES[mes].toLowerCase()} de {anio}. Prueba con otro mes.</p>
      )}

      {!cargando && !error && usuarios.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th className="tabla__usuario">Usuario</th>

                {diasDelMes.map(({ dia, clave, diaSemana }) => {
                  const clases = [
                    "tabla__dia",
                    diaSemana === 1 ? "es-lunes" : "",
                    diaSemana === 0 || diaSemana === 6 ? "es-finde" : "",
                    setFestivosClaves.has(clave) ? "es-festivo" : "",
                    clave === claveHoy ? "es-hoy" : "",
                  ].join(" ");

                  return (
                    <th key={clave} className={clases}>
                      <span className="tabla__nombre-dia">{DIAS_SEMANA[diaSemana]}</span>
                      <span className="tabla__numero-dia">{dia}</span>
                    </th>
                  );
                })}

                <th className="tabla__total">C</th>
                <th className="tabla__total">O</th>
              </tr>
            </thead>

            <tbody>
              {usuarios.map((usuario) => (
                <tr key={usuario}>
                  <th scope="row" className="tabla__usuario">{usuario}</th>

                  {diasDelMes.map(({ clave, diaSemana }) => {
                    const modalidad = calendarioPorUsuario[usuario][clave];
                    const reemplazo =  reemplazosMapa[    `${clave}-${usuario}`  ];
                    const info = MODALIDADES[modalidad];
                    const esFestivo = setFestivosClaves.has(clave);
                    const esFinde = diaSemana === 0 || diaSemana === 6;

                    const clases = [
                        "celda",
                        
                        reemplazo
                        ? "celda--reemplazo"
                        : esFestivo
                        ? "celda--festivo"
                        : info
                        ? `celda--${info.clase}`
                        : "",
                    
                        !esFestivo && !info && esFinde
                        ? "celda--finde"
                        : "",
                    
                        clave === claveHoy
                        ? "es-hoy"
                        : ""
                  ].join(" ");

                    const titulo =  reemplazo? 
                    `${reemplazo.suplente} reemplaza a ${reemplazo.usuario}`
                        : esFestivo
                        ? "Festivo"
                        : info
                        ? info.etiqueta
                        : "Sin registro";
                    return (
                      <td key={clave} className={clases} title={`${usuario} · ${clave} · ${titulo}`}>
                        {reemplazo? "REP": !esFestivo && info? info.letra: ""}
                      </td>
                    );
                  })}

                  <td className="tabla__total">{contarModalidad(usuario, "CASA")}</td>
                  <td className="tabla__total">{contarModalidad(usuario, "OFICINA")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const estilos = `
.gantt {
  --tinta: #1e293b;
  --tinta-suave: #64748b;
  --linea: #e2e8f0;
  --fondo: #f8fafc;
  --superficie: #ffffff;
  --casa: #0f9d7a;
  --oficina: #3b5bdb;
  --festivo: #e11d48;
  --finde: #f1f5f9;
  --lunes: #fff7e0;
  --hoy: #f59e0b;

  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  color: var(--tinta);
  background: var(--fondo);
  padding: 32px clamp(16px, 4vw, 48px);
  min-height: 100vh;
  box-sizing: border-box;
}

.gantt__encabezado {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}

.gantt__titulo {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.gantt__subtitulo {
  margin: 4px 0 0;
  color: var(--tinta-suave);
  font-size: 0.95rem;
}

.gantt__controles {
  display: flex;
  gap: 12px;
}

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
  outline: 2px solid var(--oficina);
  outline-offset: 1px;
}

.leyenda {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  font-size: 0.85rem;
  color: var(--tinta-suave);
}

.leyenda li { display: flex; align-items: center; gap: 8px; }

.muestra {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  display: inline-block;
}
.muestra--casa { background: var(--casa); }
.muestra--oficina { background: var(--oficina); }
.muestra--festivo { background: var(--festivo); }
.muestra--finde { background: var(--finde); border: 1px solid var(--linea); }

.estado {
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: 12px;
  padding: 24px;
  color: var(--tinta-suave);
}
.estado--error {
  color: #9f1239;
  background: #fff1f2;
  border-color: #fecdd3;
}

.tabla-contenedor {
  overflow-x: auto;
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.tabla {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  font-size: 0.8rem;
}

.tabla th,
.tabla td {
  border-bottom: 1px solid var(--linea);
  border-right: 1px solid var(--linea);
  text-align: center;
  padding: 0;
}

.tabla tbody tr:last-child th,
.tabla tbody tr:last-child td { border-bottom: none; }

.tabla__usuario {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--superficie);
  text-align: left !important;
  padding: 0 16px !important;
  min-width: 170px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 2px 0 0 var(--linea);
}

thead .tabla__usuario { z-index: 3; color: var(--tinta-suave); font-weight: 500; }

.tabla__dia {
  min-width: 38px;
  padding: 8px 0 !important;
  background: var(--superficie);
  font-weight: 500;
}
.tabla__nombre-dia { display: block; font-size: 0.7rem; color: var(--tinta-suave); }
.tabla__numero-dia { display: block; font-size: 0.95rem; margin-top: 2px; }

.tabla__dia.es-lunes { background: var(--lunes); }
.tabla__dia.es-finde { background: var(--finde); }
.tabla__dia.es-festivo { background: #ffe4e6; color: var(--festivo); }
.tabla__dia.es-hoy { box-shadow: inset 0 -3px 0 var(--hoy); }

.celda {
  height: 38px;
  min-width: 38px;
  font-weight: 700;
  color: #fff;
}
.celda--casa { background: var(--casa); }
.celda--oficina { background: var(--oficina); }
.celda--festivo { background: var(--festivo); }
.celda--finde { background: var(--finde); }
.celda--reemplazo {background: #f59e0b;}
.celda.es-hoy { box-shadow: inset 0 0 0 2px var(--hoy); }

.tabla__total {
  min-width: 40px;
  padding: 0 8px !important;
  font-weight: 600;
  color: var(--tinta-suave);
  background: var(--fondo);
}

@media (max-width: 640px) {
  .tabla__usuario { min-width: 120px; padding: 0 10px !important; }
}
`;

export default Gantt;