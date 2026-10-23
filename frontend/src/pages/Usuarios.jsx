import { useCallback, useEffect, useState } from "react";

const API_URL = "http://localhost:8000";

/** Intenta leer el mensaje de error que envía el servidor (campo "detail"). */
const leerError = async (res, porDefecto) => {
  try {
    const cuerpo = await res.json();
    return typeof cuerpo.detail === "string" ? cuerpo.detail : porDefecto;
  } catch {
    return porDefecto;
  }
};

function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [nombre, setNombre] = useState("");

  const [idEditando, setIdEditando] = useState(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [idPorEliminar, setIdPorEliminar] = useState(null);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo: "ok" | "error", texto }

  // ---------- Carga de datos ----------
  const cargarUsuarios = useCallback(async () => {
    const res = await fetch(`${API_URL}/usuarios`);
    if (!res.ok) throw new Error("No se pudieron cargar los usuarios.");
    setUsuarios(await res.json());
  }, []);

  useEffect(() => {
    const cargarInicial = async () => {
      try {
        await cargarUsuarios();
      } catch {
        setAviso({ tipo: "error", texto: `No se pudo conectar con el servidor en ${API_URL}.` });
      } finally {
        setCargando(false);
      }
    };

    cargarInicial();
  }, [cargarUsuarios]);

  // El aviso desaparece solo a los 4 segundos
  useEffect(() => {
    if (!aviso) return;
    const temporizador = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(temporizador);
  }, [aviso]);

  // ---------- Utilidades ----------
  const nombreRepetido = (valor, excluirId = null) =>
    usuarios.some(
      (u) => u.id !== excluirId && u.nombre.trim().toLowerCase() === valor.trim().toLowerCase()
    );

  // ---------- Acciones ----------
  const crearUsuario = async () => {
    const limpio = nombre.trim();

    if (!limpio) {
      setAviso({ tipo: "error", texto: "Escribe un nombre para el usuario." });
      return;
    }
    if (nombreRepetido(limpio)) {
      setAviso({ tipo: "error", texto: "Ya existe un usuario con ese nombre." });
      return;
    }

    try {
      setGuardando(true);

      const params = new URLSearchParams({ nombre: limpio });
      const res = await fetch(`${API_URL}/usuarios?${params}`, { method: "POST" });

      if (!res.ok) {
        setAviso({ tipo: "error", texto: await leerError(res, "No se pudo crear el usuario.") });
        return;
      }

      setNombre("");
      await cargarUsuarios();
      setAviso({ tipo: "ok", texto: "Usuario creado." });
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardando(false);
    }
  };

  const empezarEdicion = (usuario) => {
    setIdPorEliminar(null);
    setIdEditando(usuario.id);
    setNombreEditado(usuario.nombre);
  };

  const cancelarEdicion = () => {
    setIdEditando(null);
    setNombreEditado("");
  };

  const guardarEdicion = async (id) => {
    const limpio = nombreEditado.trim();

    if (!limpio) {
      setAviso({ tipo: "error", texto: "El nombre no puede estar vacío." });
      return;
    }
    if (nombreRepetido(limpio, id)) {
      setAviso({ tipo: "error", texto: "Ya existe un usuario con ese nombre." });
      return;
    }

    try {
      setGuardando(true);

      const params = new URLSearchParams({ nombre: limpio });
      const res = await fetch(`${API_URL}/usuarios/${id}?${params}`, { method: "PUT" });

      if (!res.ok) {
        setAviso({ tipo: "error", texto: await leerError(res, "No se pudo actualizar el usuario.") });
        return;
      }

      cancelarEdicion();
      await cargarUsuarios();
      setAviso({ tipo: "ok", texto: "Usuario actualizado." });
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardando(false);
    }
  };

  const eliminarUsuario = async (id) => {
    try {
      setGuardando(true);

      const res = await fetch(`${API_URL}/usuarios/${id}`, { method: "DELETE" });

      if (!res.ok) {
        setAviso({ tipo: "error", texto: await leerError(res, "No se pudo eliminar el usuario.") });
        return;
      }

      setIdPorEliminar(null);
      await cargarUsuarios();
      setAviso({ tipo: "ok", texto: "Usuario eliminado." });
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardando(false);
    }
  };

  // ---------- Render ----------
  return (
    <div className="usuarios">
      <style>{estilos}</style>

      <header className="usuarios__encabezado">
        <h1 className="usuarios__titulo">Usuarios</h1>
        <p className="usuarios__subtitulo">Administra las personas que aparecen en el cronograma.</p>
      </header>

      {aviso && (
        <p className={`aviso aviso--${aviso.tipo}`} role={aviso.tipo === "error" ? "alert" : "status"}>
          {aviso.texto}
        </p>
      )}

      <section className="tarjeta" aria-labelledby="titulo-nuevo">
        <h2 id="titulo-nuevo" className="tarjeta__titulo">Nuevo usuario</h2>

        <div className="formulario">
          <label className="campo">
            <span>Nombre</span>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !guardando && crearUsuario()}
              placeholder="Ej. María Gómez"
              disabled={cargando || guardando}
            />
          </label>

          <button
            type="button"
            className="boton boton--primario"
            onClick={crearUsuario}
            disabled={cargando || guardando}
          >
            {guardando && idEditando === null && idPorEliminar === null ? "Guardando…" : "Agregar usuario"}
          </button>
        </div>
      </section>

      <section className="tarjeta" aria-labelledby="titulo-lista">
        <h2 id="titulo-lista" className="tarjeta__titulo">
          Usuarios registrados
          {!cargando && <span className="contador">{usuarios.length}</span>}
        </h2>

        {cargando && <p className="vacio">Cargando usuarios…</p>}

        {!cargando && usuarios.length === 0 && (
          <p className="vacio">Aún no hay usuarios. Agrega el primero con el formulario de arriba.</p>
        )}

        {!cargando && usuarios.length > 0 && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th className="tabla__acciones">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td className="tabla__id">{u.id}</td>

                    <td>
                      {idEditando === u.id ? (
                        <input
                          className="entrada-tabla"
                          type="text"
                          value={nombreEditado}
                          onChange={(e) => setNombreEditado(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") guardarEdicion(u.id);
                            if (e.key === "Escape") cancelarEdicion();
                          }}
                          aria-label={`Nuevo nombre para ${u.nombre}`}
                          autoFocus
                        />
                      ) : (
                        u.nombre
                      )}
                    </td>

                    <td className="tabla__acciones">
                      {idEditando === u.id ? (
                        <span className="grupo-botones">
                          <button
                            type="button"
                            className="boton boton--primario boton--chico"
                            onClick={() => guardarEdicion(u.id)}
                            disabled={guardando}
                          >
                            Guardar
                          </button>
                          <button type="button" className="boton boton--suave" onClick={cancelarEdicion}>
                            Cancelar
                          </button>
                        </span>
                      ) : idPorEliminar === u.id ? (
                        <span className="grupo-botones">
                          <span className="confirmacion">
                            Se borrarán también sus asistencias y restricciones.
                          </span>
                          <button
                            type="button"
                            className="boton boton--peligro"
                            onClick={() => eliminarUsuario(u.id)}
                            disabled={guardando}
                          >
                            Sí, eliminar
                          </button>
                          <button type="button" className="boton boton--suave" onClick={() => setIdPorEliminar(null)}>
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <span className="grupo-botones">
                          <button type="button" className="boton boton--suave" onClick={() => empezarEdicion(u)}>
                            Editar
                          </button>
                          <button
                            type="button"
                            className="boton boton--suave boton--alerta"
                            onClick={() => {
                              cancelarEdicion();
                              setIdPorEliminar(u.id);
                            }}
                          >
                            Eliminar
                          </button>
                        </span>
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
.usuarios {
  --tinta: #1e293b;
  --tinta-suave: #64748b;
  --linea: #e2e8f0;
  --fondo: #f8fafc;
  --superficie: #ffffff;
  --primario: #3b5bdb;
  --primario-oscuro: #2f49b3;
  --peligro: #e11d48;

  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  color: var(--tinta);
  background: var(--fondo);
  padding: 32px clamp(16px, 4vw, 48px);
  min-height: 100vh;
  box-sizing: border-box;
}

.usuarios__encabezado { margin-bottom: 20px; }
.usuarios__titulo { margin: 0; font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; }
.usuarios__subtitulo { margin: 4px 0 0; color: var(--tinta-suave); font-size: 0.95rem; }

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
  gap: 100px;
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

.formulario { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; }

.campo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--tinta-suave);
  flex: 1 1 260px;
}

.campo input,
.entrada-tabla {
  font: inherit;
  font-size: 0.95rem;
  color: var(--tinta);
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: 8px;
  padding: 10px 12px;
  box-sizing: border-box;
}
.entrada-tabla { width: 100%; max-width: 320px; padding: 7px 10px; }
.campo input:disabled { background: var(--fondo); }

.campo input:focus-visible,
.entrada-tabla:focus-visible,
.boton:focus-visible {
  outline: 2px solid var(--primario);
  outline-offset: 2px;
}

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
.boton--chico { padding: 6px 12px; }

.boton--suave {
  color: var(--tinta);
  background: var(--superficie);
  border-color: var(--linea);
  padding: 6px 12px;
}
.boton--suave:hover { background: var(--fondo); }
.boton--alerta:hover { color: var(--peligro); border-color: #fecdd3; background: #fff1f2; }

.boton--peligro { color: #fff; background: var(--peligro); padding: 6px 12px; }
.boton--peligro:hover:not(:disabled) { background: #be123c; }

.vacio { margin: 0; color: var(--tinta-suave); }

.tabla-contenedor { overflow-x: auto; border: 1px solid var(--linea); border-radius: 10px; }
.tabla { width: 100%; border-collapse: collapse; font-size: 0.9rem; }

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
.tabla__acciones { text-align: right !important; }

.grupo-botones {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.confirmacion { font-size: 0.85rem; color: var(--peligro); }
`;

export default Usuarios;
