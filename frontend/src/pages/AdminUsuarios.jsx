import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_URL = "http://localhost:8000";
const ROLES = ["ADMIN", "LIDER", "USUARIO"];
const MIN_PASSWORD = 6;

/** Saca un mensaje legible de una respuesta de error de la API. */
function mensajeDeError(data, porDefecto) {
  const detalle = data?.detail;
  return typeof detalle === "string" ? detalle : porDefecto;
}

function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [errorLista, setErrorLista] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [usuarioId, setUsuarioId] = useState("");
  const [original, setOriginal] = useState(null);
  const [cargandoUsuario, setCargandoUsuario] = useState(false);

  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [rol, setRol] = useState("USUARIO");
  const [activo, setActivo] = useState(true);

  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo: "ok" | "error", texto }

  const peticionActual = useRef(0);

  /* ---------- Lista de usuarios ---------- */
  const cargarLista = useCallback(async () => {
    setErrorLista("");
    try {
      const response = await fetch(`${API_URL}/usuarios`);
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) {
        throw new Error(mensajeDeError(data, "No se pudo cargar la lista."));
      }
      setUsuarios(data);
    } catch (err) {
      setErrorLista(err.message || "No se pudo conectar con el servidor.");
    } finally {
      setCargandoLista(false);
    }
  }, []);

  useEffect(() => {
    cargarLista();
  }, [cargarLista]);

  /* El aviso desaparece solo */
  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 4500);
    return () => clearTimeout(t);
  }, [aviso]);

  /* ---------- Cargar un usuario ---------- */
  const cargarUsuario = async (id) => {
    if (String(id) === String(usuarioId)) return;

    if (hayCambios && !window.confirm("Tienes cambios sin guardar. ¿Descartarlos?")) {
      return;
    }

    setUsuarioId(id);
    setAviso(null);
    setPassword("");
    setVerPassword(false);
    setCargandoUsuario(true);

    const turno = ++peticionActual.current;

        try {
      const data = usuarios.find((u) => String(u.id) === String(id));
      if (!data) throw new Error("Usuario no encontrado.");
      if (turno !== peticionActual.current) return;

      const datos = {
        nombre: data.nombre || "",
        usuario: data.usuario || "",
        rol: (data.rol || "USUARIO").toUpperCase(),
        activo: data.activo ?? true,
      };
      setNombre(datos.nombre);
      setUsuario(datos.usuario);
      setRol(datos.rol);
      setActivo(datos.activo);
      setOriginal(datos);
    } catch (err) {
      if (turno !== peticionActual.current) return;
      setOriginal(null);
      setUsuarioId("");
      setAviso({ tipo: "error", texto: err.message || "No se pudo conectar con el servidor." });
    } finally {
      if (turno === peticionActual.current) setCargandoUsuario(false);
    }
  };

  /* ---------- Estado derivado ---------- */
  const hayCambios = useMemo(() => {
    if (!original) return false;
    return (
      usuario !== original.usuario ||
      rol !== original.rol ||
      activo !== original.activo ||
      password !== ""
    );
  }, [original, usuario, rol, activo, password]);

  const usuariosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(
      (u) =>
        (u.nombre || "").toLowerCase().includes(q) ||
        (u.usuario || "").toLowerCase().includes(q)
    );
  }, [usuarios, busqueda]);

  /* ---------- Acciones ---------- */
  const descartar = () => {
    if (!original) return;
    setUsuario(original.usuario);
    setRol(original.rol);
    setActivo(original.activo);
    setPassword("");
    setAviso(null);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!usuarioId || guardando || !hayCambios) return;

    const usuarioLimpio = usuario.trim();

    if (!usuarioLimpio) {
      setAviso({ tipo: "error", texto: "El usuario de login no puede estar vacío." });
      return;
    }
    if (password && password.length < MIN_PASSWORD) {
      setAviso({
        tipo: "error",
        texto: `La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
      });
      return;
    }
    if (original?.activo && !activo) {
      if (!window.confirm(`¿Bloquear a ${nombre}? No podrá iniciar sesión.`)) return;
    }

    const params = new URLSearchParams({
      usuario: usuarioLimpio,
      rol,
      activo: String(activo),
    });
    // Solo se envía la contraseña si se escribió una nueva
    if (password) params.set("password", password);

    setGuardando(true);
    setAviso(null);

    try {
      const response = await fetch(
        `${API_URL}/usuarios/${usuarioId}/credenciales?${params.toString()}`,
        { method: "PUT" }
      );

      let data = null;
      try {
        data = await response.json();
      } catch {
        /* respuesta sin JSON */
      }

      if (!response.ok || data?.detail) {
        setAviso({
          tipo: "error",
          texto: mensajeDeError(data, "No se pudieron guardar los cambios."),
        });
        return;
      }

      setOriginal({ nombre, usuario: usuarioLimpio, rol, activo });
      setUsuario(usuarioLimpio);
      setPassword("");
      setVerPassword(false);
      setAviso({ tipo: "ok", texto: data?.mensaje || "Cambios guardados correctamente." });
      cargarLista();
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardando(false);
    }
  };

  const iniciales = (texto) =>
    (texto || "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("");

  /* ---------- Render ---------- */
  return (
    <div className="adm">
      <style>{estilos}</style>

      <h1 className="adm__titulo">Administración de usuarios</h1>
      <p className="adm__subtitulo">
        Gestiona el usuario de acceso, la contraseña, el rol y el estado de cada persona.
      </p>

      <div className="adm__layout">
        {/* ----- Lista ----- */}
        <section className="adm__panel adm__lista">
          <input
            className="adm__input"
            type="search"
            placeholder="Buscar por nombre o usuario…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar usuarios"
          />

          <div className="adm__items" role="listbox" aria-label="Usuarios">
            {cargandoLista && <p className="adm__vacio">Cargando usuarios…</p>}

            {!cargandoLista && errorLista && (
              <div className="adm__vacio">
                <p>{errorLista}</p>
                <button
                  type="button"
                  className="adm__boton adm__boton--sec"
                  onClick={() => {
                    setCargandoLista(true);
                    cargarLista();
                  }}
                >
                  Reintentar
                </button>
              </div>
            )}

            {!cargandoLista && !errorLista && usuariosFiltrados.length === 0 && (
              <p className="adm__vacio">No se encontraron usuarios.</p>
            )}

            {usuariosFiltrados.map((u) => {
              const seleccionado = String(u.id) === String(usuarioId);
              return (
                <button
                  type="button"
                  key={u.id}
                  role="option"
                  aria-selected={seleccionado}
                  className={seleccionado ? "adm__item adm__item--activo" : "adm__item"}
                  onClick={() => cargarUsuario(u.id)}
                >
                  <span className="adm__avatar" aria-hidden="true">{iniciales(u.nombre)}</span>
                  <span className="adm__item-info">
                    <span className="adm__item-nombre">{u.nombre}</span>
                    {u.usuario && <span className="adm__item-sub">@{u.usuario}</span>}
                  </span>
                  {u.activo === false && <span className="adm__chip adm__chip--bloq">Bloqueado</span>}
                </button>
              );
            })}
          </div>
        </section>

        {/* ----- Formulario ----- */}
        <section className="adm__panel">
          {!usuarioId ? (
            <div className="adm__placeholder">
              <span aria-hidden="true">👈</span>
              <p>Selecciona un usuario de la lista para editarlo.</p>
            </div>
          ) : (
            <form onSubmit={guardar} noValidate className={cargandoUsuario ? "adm__form adm__form--carga" : "adm__form"}>
              <div className="adm__cabecera">
                <span className="adm__avatar adm__avatar--grande" aria-hidden="true">{iniciales(nombre)}</span>
                <div>
                  <h2 className="adm__nombre">{nombre || "Cargando…"}</h2>
                  <span className={activo ? "adm__chip adm__chip--ok" : "adm__chip adm__chip--bloq"}>
                    {activo ? "Activo" : "Bloqueado"}
                  </span>
                </div>
              </div>

              {aviso && (
                <div
                  className={aviso.tipo === "ok" ? "adm__aviso adm__aviso--ok" : "adm__aviso adm__aviso--error"}
                  role={aviso.tipo === "ok" ? "status" : "alert"}
                >
                  {aviso.tipo === "ok" ? "✅" : "⚠️"} {aviso.texto}
                </div>
              )}

              <label className="adm__campo">
                <span className="adm__etiqueta">Nombre</span>
                <input className="adm__input" value={nombre} readOnly disabled />
              </label>

              <label className="adm__campo">
                <span className="adm__etiqueta">Usuario de login</span>
                <input
                  className="adm__input"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Usuario de login"
                  autoComplete="off"
                  disabled={cargandoUsuario || guardando}
                />
              </label>

              <label className="adm__campo">
                <span className="adm__etiqueta">Nueva contraseña</span>
                <div className="adm__password">
                  <input
                    className="adm__input"
                    type={verPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Déjala vacía para no cambiarla"
                    autoComplete="new-password"
                    disabled={cargandoUsuario || guardando}
                  />
                  <button
                    type="button"
                    className="adm__ojo"
                    onClick={() => setVerPassword((v) => !v)}
                    aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    title={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {verPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </label>

              <div className="adm__fila">
                <label className="adm__campo">
                  <span className="adm__etiqueta">Rol</span>
                  <select
                    className="adm__input"
                    value={rol}
                    onChange={(e) => setRol(e.target.value)}
                    disabled={cargandoUsuario || guardando}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </label>

                <label className="adm__campo">
                  <span className="adm__etiqueta">Estado</span>
                  <select
                    className="adm__input"
                    value={activo ? "true" : "false"}
                    onChange={(e) => setActivo(e.target.value === "true")}
                    disabled={cargandoUsuario || guardando}
                  >
                    <option value="true">Activo</option>
                    <option value="false">Bloqueado</option>
                  </select>
                </label>
              </div>

              <div className="adm__acciones">
                <button
                  type="button"
                  className="adm__boton adm__boton--sec"
                  onClick={descartar}
                  disabled={!hayCambios || guardando}
                >
                  Descartar
                </button>
                <button
                  type="submit"
                  className="adm__boton"
                  disabled={!hayCambios || guardando || cargandoUsuario}
                >
                  {guardando ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

const estilos = `
.adm {
  max-width: 980px;
  margin: 0 auto;
  padding: 24px;
  box-sizing: border-box;
  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  color: #1e293b;
}
.adm__titulo { margin: 0; font-size: 1.5rem; letter-spacing: -0.01em; }
.adm__subtitulo { margin: 6px 0 20px; font-size: 0.9rem; color: #64748b; }

.adm__layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
  align-items: start;
}

.adm__panel {
  padding: 20px;
  box-sizing: border-box;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);
}

/* ---------- Lista ---------- */
.adm__lista { display: flex; flex-direction: column; gap: 12px; }
.adm__items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 460px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.adm__vacio { margin: 12px 0; text-align: center; font-size: 0.85rem; color: #64748b; }

.adm__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.adm__item:hover { background: #f1f5f9; }
.adm__item:focus-visible { outline: 2px solid #3b5bdb; outline-offset: 2px; }
.adm__item--activo { background: #edf2ff; border-color: #c5d0fa; }

.adm__avatar {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b5bdb, #5c7cfa);
  font-size: 0.75rem;
  font-weight: 700;
  color: #ffffff;
}
.adm__avatar--grande { width: 48px; height: 48px; font-size: 1rem; }

.adm__item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.adm__item-nombre {
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.adm__item-sub { font-size: 0.75rem; color: #64748b; }

/* ---------- Formulario ---------- */
.adm__placeholder {
  display: grid;
  place-items: center;
  gap: 6px;
  padding: 60px 20px;
  text-align: center;
  font-size: 0.95rem;
  color: #64748b;
}
.adm__placeholder span { font-size: 2rem; }
.adm__placeholder p { margin: 0; }

.adm__form { display: flex; flex-direction: column; gap: 16px; transition: opacity 0.2s; }
.adm__form--carga { opacity: 0.6; pointer-events: none; }

.adm__cabecera { display: flex; align-items: center; gap: 14px; }
.adm__nombre { margin: 0 0 4px; font-size: 1.15rem; }

.adm__chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
}
.adm__chip--ok { background: #dcfce7; color: #15803d; }
.adm__chip--bloq { background: #fee2e2; color: #b91c1c; }

.adm__aviso {
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 0.85rem;
  animation: adm-entrada 0.25s ease backwards;
}
.adm__aviso--ok { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
.adm__aviso--error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }

.adm__campo { display: block; flex: 1; }
.adm__etiqueta { display: block; margin-bottom: 6px; font-size: 0.85rem; font-weight: 600; color: #475569; }
.adm__fila { display: flex; gap: 16px; }

.adm__input {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  font-size: 0.95rem;
  color: #1e293b;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.adm__input::placeholder { color: #94a3b8; }
.adm__input:focus { outline: none; border-color: #3b5bdb; box-shadow: 0 0 0 3px rgba(59, 91, 219, 0.15); }
.adm__input:disabled { background: #f1f5f9; color: #64748b; cursor: not-allowed; }

.adm__password { position: relative; }
.adm__password .adm__input { padding-right: 44px; }
.adm__ojo {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}
.adm__ojo:hover { background: #f1f5f9; }

.adm__acciones { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
.adm__boton {
  height: 42px;
  padding: 0 18px;
  border: 1px solid #3b5bdb;
  border-radius: 10px;
  background: #3b5bdb;
  font-size: 0.9rem;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: background-color 0.15s, transform 0.15s, opacity 0.15s;
}
.adm__boton:hover:not(:disabled) { background: #364fc7; }
.adm__boton:active:not(:disabled) { transform: scale(0.98); }
.adm__boton:focus-visible { outline: 2px solid #3b5bdb; outline-offset: 2px; }
.adm__boton:disabled { opacity: 0.5; cursor: not-allowed; }
.adm__boton--sec { background: #ffffff; color: #475569; border-color: #cbd5e1; }
.adm__boton--sec:hover:not(:disabled) { background: #f1f5f9; }

@keyframes adm-entrada {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}

@media (max-width: 800px) {
  .adm__layout { grid-template-columns: 1fr; }
  .adm__items { max-height: 240px; }
  .adm__fila { flex-direction: column; gap: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .adm__aviso { animation: none; }
  .adm__form, .adm__input, .adm__boton, .adm__item { transition: none; }
}
`;

export default AdminUsuarios;