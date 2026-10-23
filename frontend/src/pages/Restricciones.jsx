import { useCallback, useEffect, useState } from "react";

const API_URL = "http://localhost:8000";

function Restricciones() {
  const [usuarios, setUsuarios] = useState([]);
  const [restricciones, setRestricciones] = useState([]);

  const [usuario1, setUsuario1] = useState("");
  const [usuario2, setUsuario2] = useState("");

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [idPorEliminar, setIdPorEliminar] = useState(null);
  const [aviso, setAviso] = useState(null); // { tipo: "ok" | "error", texto }

  // ---------- Carga de datos ----------
  const cargarRestricciones = useCallback(async () => {
    const res = await fetch(`${API_URL}/restricciones`);
    if (!res.ok) throw new Error("No se pudieron cargar las restricciones.");
    setRestricciones(await res.json());
  }, []);

  useEffect(() => {
    const cargarTodo = async () => {
      try {
        setCargando(true);
        const resUsuarios = await fetch(`${API_URL}/usuarios`);
        if (!resUsuarios.ok) throw new Error("No se pudieron cargar los usuarios.");
        setUsuarios(await resUsuarios.json());
        await cargarRestricciones();
      } catch {
        setAviso({
          tipo: "error",
          texto: `No se pudo conectar con el servidor en ${API_URL}.`,
        });
      } finally {
        setCargando(false);
      }
    };

    cargarTodo();
  }, [cargarRestricciones]);

  // El aviso desaparece solo a los 4 segundos
  useEffect(() => {
    if (!aviso) return;
    const temporizador = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(temporizador);
  }, [aviso]);

  // ---------- Acciones ----------
  const crearRestriccion = async () => {
    if (!usuario1 || !usuario2) {
      setAviso({ tipo: "error", texto: "Selecciona ambos usuarios." });
      return;
    }

    if (usuario1 === usuario2) {
      setAviso({ tipo: "error", texto: "No puedes crear una restricción de un usuario consigo mismo." });
      return;
    }

    const nombre1 = usuarios.find((u) => String(u.id) === usuario1)?.nombre;
    const nombre2 = usuarios.find((u) => String(u.id) === usuario2)?.nombre;

    const yaExiste = restricciones.some(
      (r) =>
        (r.usuario1 === nombre1 && r.usuario2 === nombre2) ||
        (r.usuario1 === nombre2 && r.usuario2 === nombre1)
    );

    if (yaExiste) {
      setAviso({ tipo: "error", texto: "Esa restricción ya existe." });
      return;
    }

    try {
      setGuardando(true);

      const params = new URLSearchParams({
        usuario1_id: usuario1,
        usuario2_id: usuario2,
      });

      const res = await fetch(`${API_URL}/restricciones?${params}`, { method: "POST" });
      if (!res.ok) throw new Error();

      setUsuario1("");
      setUsuario2("");
      await cargarRestricciones();
      setAviso({ tipo: "ok", texto: "Restricción creada." });
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo crear la restricción. Inténtalo de nuevo." });
    } finally {
      setGuardando(false);
    }
  };

  const eliminarRestriccion = async (id) => {
    try {
      const res = await fetch(`${API_URL}/restricciones/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();

      setIdPorEliminar(null);
      await cargarRestricciones();
      setAviso({ tipo: "ok", texto: "Restricción eliminada." });
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo eliminar la restricción. Inténtalo de nuevo." });
    }
  };

  // ---------- Render ----------
  return (
    <div className="restricciones">
      <style>{estilos}</style>

      <header className="restricciones__encabezado">
        <h1 className="restricciones__titulo">Restricciones</h1>
        <p className="restricciones__subtitulo">
          Define qué personas no pueden coincidir en el mismo día en la oficina.
        </p>
      </header>

      {aviso && (
        <p
          className={`aviso aviso--${aviso.tipo}`}
          role={aviso.tipo === "error" ? "alert" : "status"}
        >
          {aviso.texto}
        </p>
      )}

      <section className="tarjeta" aria-labelledby="titulo-nueva">
        <h2 id="titulo-nueva" className="tarjeta__titulo">Nueva restricción</h2>

        <div className="formulario">
          <label className="campo">
            <span>Usuario 1</span>
            <select
              value={usuario1}
              onChange={(e) => setUsuario1(e.target.value)}
              disabled={cargando || guardando}
            >
              <option value="">Selecciona un usuario</option>
              {usuarios.map((u) => (
                <option key={u.id} value={String(u.id)} disabled={String(u.id) === usuario2}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="campo">
            <span>Usuario 2</span>
            <select
              value={usuario2}
              onChange={(e) => setUsuario2(e.target.value)}
              disabled={cargando || guardando}
            >
              <option value="">Selecciona un usuario</option>
              {usuarios.map((u) => (
                <option key={u.id} value={String(u.id)} disabled={String(u.id) === usuario1}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="boton boton--primario"
            onClick={crearRestriccion}
            disabled={cargando || guardando}
          >
            {guardando ? "Guardando…" : "Crear restricción"}
          </button>
        </div>
      </section>

      <section className="tarjeta" aria-labelledby="titulo-lista">
        <h2 id="titulo-lista" className="tarjeta__titulo">
          Restricciones activas
          {!cargando && <span className="contador">{restricciones.length}</span>}
        </h2>

        {cargando && <p className="vacio">Cargando restricciones…</p>}

        {!cargando && restricciones.length === 0 && (
          <p className="vacio">Aún no hay restricciones. Crea la primera con el formulario de arriba.</p>
        )}

        {!cargando && restricciones.length > 0 && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Usuario 1</th>
                  <th>Usuario 2</th>
                  <th className="tabla__acciones">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {restricciones.map((r) => (
                  <tr key={r.id}>
                    <td className="tabla__id">{r.id}</td>
                    <td>{r.usuario1}</td>
                    <td>{r.usuario2}</td>
                    <td className="tabla__acciones">
                      {idPorEliminar === r.id ? (
                        <span className="confirmacion">
                          ¿Eliminar?
                          <button
                            type="button"
                            className="boton boton--peligro"
                            onClick={() => eliminarRestriccion(r.id)}
                          >
                            Sí, eliminar
                          </button>
                          <button
                            type="button"
                            className="boton boton--suave"
                            onClick={() => setIdPorEliminar(null)}
                          >
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="boton boton--suave"
                          onClick={() => setIdPorEliminar(r.id)}
                        >
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const estilos = `
.restricciones {
  --tinta: #1e293b;
  --tinta-suave: #64748b;
  --linea: #e2e8f0;
  --fondo: #f8fafc;
  --superficie: #ffffff;
  --primario: #3b5bdb;
  --primario-oscuro: #2f49b3;
  --peligro: #e11d48;
  --exito: #0f9d7a;

  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  color: var(--tinta);
  background: var(--fondo);
  padding: 32px clamp(16px, 4vw, 48px);
  min-height: 100vh;
  box-sizing: border-box;
}

.restricciones__encabezado { margin-bottom: 20px; }

.restricciones__titulo {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.restricciones__subtitulo {
  margin: 4px 0 0;
  color: var(--tinta-suave);
  font-size: 0.95rem;
}

.aviso {
  margin: 0 0 16px;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 0.9rem;
  border: 1px solid;
}
.aviso--ok { color: #065f46; background: #ecfdf5; border-color: #a7f3d0; }
.aviso--error { color: #9f1239; background: #fff1f2; border-color: #fecdd3; }

.tarjeta {
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.tarjeta__titulo {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px;
  font-size: 1.1rem;
  font-weight: 600;
}

.contador {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primario);
  background: #edf2ff;
  border-radius: 999px;
  padding: 2px 10px;
}

.formulario {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--tinta-suave);
  flex: 1 1 200px;
}

.campo select {
  font: inherit;
  font-size: 0.95rem;
  color: var(--tinta);
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: 8px;
  padding: 10px 12px;
}

.campo select:focus-visible,
.boton:focus-visible {
  outline: 2px solid var(--primario);
  outline-offset: 2px;
}

.campo select:disabled { background: var(--fondo); }

.boton {
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 10px 18px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.boton:disabled { opacity: 0.6; cursor: not-allowed; }

.boton--primario { color: #fff; background: var(--primario); }
.boton--primario:hover:not(:disabled) { background: var(--primario-oscuro); }

.boton--suave {
  color: var(--tinta);
  background: var(--superficie);
  border-color: var(--linea);
  padding: 6px 12px;
}
.boton--suave:hover { background: var(--fondo); }

.boton--peligro {
  color: #fff;
  background: var(--peligro);
  padding: 6px 12px;
}
.boton--peligro:hover { background: #be123c; }

.vacio { margin: 0; color: var(--tinta-suave); }

.tabla-contenedor {
  overflow-x: auto;
  border: 1px solid var(--linea);
  border-radius: 10px;
}

.tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.tabla th,
.tabla td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--linea);
}

.tabla thead th {
  background: var(--fondo);
  color: var(--tinta-suave);
  font-weight: 500;
  font-size: 0.8rem;
}

.tabla tbody tr:last-child td { border-bottom: none; }
.tabla tbody tr:hover { background: #fafbff; }

.tabla__id { color: var(--tinta-suave); width: 70px; }
.tabla__acciones { text-align: right !important; white-space: nowrap; }

.confirmacion {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--peligro);
}
`;

export default Restricciones;