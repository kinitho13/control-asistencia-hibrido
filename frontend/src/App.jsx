import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Usuarios from "./pages/Usuarios";
import Restricciones from "./pages/Restricciones";
import Festivos from "./pages/Festivos";
import Asistencias from "./pages/Asistencias";
import Calendario from "./pages/Calendario";
import Gantt from "./pages/Gantt";
import Reemplazos from "./pages/Reemplazos";
import AdminUsuarios from "./pages/AdminUsuarios";

const ADMIN = "ADMIN";
const LIDER = "LIDER";
const USUARIO = "USUARIO";

const SECCIONES = [
  { ruta: "/", etiqueta: "Panel", roles: [ADMIN, LIDER, USUARIO], icono: "🏠", componente: <Dashboard />, exacta: true },
  { ruta: "/usuarios", etiqueta: "Usuarios", roles: [ADMIN], icono: "👥", componente: <Usuarios /> },
  { ruta: "/restricciones", etiqueta: "Restricciones", roles: [ADMIN], icono: "🚫", componente: <Restricciones /> },
  { ruta: "/festivos", etiqueta: "Festivos", roles: [ADMIN], icono: "🎉", componente: <Festivos /> },
  { ruta: "/asistencias", etiqueta: "Asistencias", roles: [ADMIN, LIDER], icono: "✅", componente: <Asistencias /> },
  { ruta: "/calendario", etiqueta: "Calendario", roles: [ADMIN, LIDER, USUARIO], icono: "📅", componente: <Calendario /> },
  { ruta: "/gantt", etiqueta: "Cronograma", roles: [ADMIN, LIDER, USUARIO], icono: "📊", componente: <Gantt /> },
  { ruta: "/reemplazos", etiqueta: "Reemplazos", roles: [ADMIN, LIDER], icono: "🔄", componente: <Reemplazos /> },
  { ruta: "/admin-usuarios", etiqueta: "Admin. usuarios", roles: [ADMIN], icono: "🛠️", componente: <AdminUsuarios /> }
];

const CLAVE_MENU = "menu-abierto";
const CLAVE_USUARIO = "usuario";

/** Recuerda si el menú estaba abierto; en pantallas pequeñas arranca cerrado. */
function leerMenuInicial() {
  try {
    const guardado = localStorage.getItem(CLAVE_MENU);
    if (guardado !== null) return guardado === "1";
  } catch {
    /* localStorage no disponible */
  }
  return window.innerWidth > 720;
}

/** Lee el usuario guardado sin romper la app si el dato está corrupto. */
function leerUsuarioInicial() {
  try {
    const guardado = localStorage.getItem(CLAVE_USUARIO);
    return guardado ? JSON.parse(guardado) : null;
  } catch {
    return null;
  }
}

function seccionesPermitidas(rol) {
  return SECCIONES.filter((s) => s.roles.includes(rol));
}

function Menu({ rol }) {
  return (
    <header className="menu">
      <div className="menu__marca">
        <span className="menu__logo">GT</span>
        <span className="menu__marca-texto">Gestión</span>
      </div>

      <nav className="menu__enlaces">
        {seccionesPermitidas(rol).map(({ ruta, etiqueta, icono, exacta }, indice) => (
          <NavLink
            key={ruta}
            to={ruta}
            end={exacta}
            title={etiqueta}
            style={{ "--i": indice }}
            className={({ isActive }) => (isActive ? "menu__enlace menu__enlace--activo" : "menu__enlace")}
          >
            <span className="menu__icono" aria-hidden="true">{icono}</span>
            <span className="menu__texto">{etiqueta}</span>
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

/** Contenido con animación de entrada cada vez que cambia la ruta. */
function Contenido({ rol }) {
  const { pathname } = useLocation();

  return (
    <main className="app__contenido">
      <div key={pathname} className="pagina">
        <Routes>
          {seccionesPermitidas(rol).map(({ ruta, componente }) => (
            <Route key={ruta} path={ruta} element={componente} />
          ))}

          {/* Rutas desconocidas o sin permiso vuelven al panel */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </main>
  );
}

function App() {
  const [usuarioLogueado, setUsuarioLogueado] = useState(leerUsuarioInicial);
  const [menuAbierto, setMenuAbierto] = useState(leerMenuInicial);

  const rol = usuarioLogueado?.rol?.toUpperCase();

  const iniciarSesion = (usuario) => {
    try {
      localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
    } catch {
      /* localStorage no disponible */
    }
    setUsuarioLogueado(usuario);
  };

  const cerrarSesion = () => {
    try {
      localStorage.removeItem(CLAVE_USUARIO);
    } catch {
      /* localStorage no disponible */
    }
    setUsuarioLogueado(null);
  };

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_MENU, menuAbierto ? "1" : "0");
    } catch {
      /* localStorage no disponible */
    }
  }, [menuAbierto]);

  if (!usuarioLogueado) {
    return <Login onLogin={iniciarSesion} />;
  }

  return (
    <BrowserRouter>
      <style>{estilos}</style>

      <div className="app">
        <aside className={menuAbierto ? "sidebar" : "sidebar sidebar--cerrado"}>
          <button
            className="sidebar__toggle"
            onClick={() => setMenuAbierto((abierto) => !abierto)}
            aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuAbierto}
          >
            ☰
          </button>

          <Menu rol={rol} />

          <button className="sidebar__salir" onClick={cerrarSesion} title="Salir">
            <span className="menu__icono" aria-hidden="true">🚪</span>
            <span className="menu__texto">Salir</span>
          </button>
        </aside>

        <Contenido rol={rol} />
      </div>
    </BrowserRouter>
  );
}

const estilos = `
body { margin: 0; display: block; background: #f8fafc; }
#root { max-width: none; margin: 0; padding: 0; text-align: left; }

.app {
  display: flex;
  min-height: 100vh;
  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
}

/* ---------- Barra lateral ---------- */
.sidebar {
  position: sticky;
  top: 0;
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 240px;
  min-width: 240px;
  height: 100vh;
  padding: 16px 12px;
  box-sizing: border-box;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar--cerrado {
  width: 72px;
  min-width: 72px;
}

.sidebar__toggle {
  flex: 0 0 auto;
  width: 100%;
  height: 40px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffff;
  font-size: 1.1rem;
  color: #475569;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, transform 0.15s;
}
.sidebar__toggle:hover { background: #f1f5f9; border-color: #cbd5e1; }
.sidebar__toggle:active { transform: scale(0.96); }
.sidebar__toggle:focus-visible { outline: 2px solid #3b5bdb; outline-offset: 2px; }

/* ---------- Botón salir ---------- */
.sidebar__salir {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: auto;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffff;
  font-size: 0.9rem;
  font-weight: 500;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}
.sidebar__salir:hover { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
.sidebar__salir:focus-visible { outline: 2px solid #3b5bdb; outline-offset: 2px; }

/* ---------- Menú ---------- */
.menu {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.menu__marca {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: -0.01em;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  transition: gap 0.3s;
}

.menu__logo {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #3b5bdb, #5c7cfa);
  box-shadow: 0 4px 10px rgba(59, 91, 219, 0.3);
  font-size: 0.8rem;
  font-weight: 700;
  color: #ffffff;
}

.menu__marca-texto {
  max-width: 160px;
  overflow: hidden;
  transition: opacity 0.2s, max-width 0.3s;
}

.menu__enlaces {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.menu__enlace {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 500;
  color: #64748b;
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  transition: background-color 0.15s, color 0.15s, transform 0.2s;
  animation: enlace-entrada 0.4s cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
  animation-delay: calc(var(--i, 0) * 40ms);
}
.menu__enlace:hover { background: #f1f5f9; color: #1e293b; transform: translateX(3px); }
.menu__enlace:focus-visible { outline: 2px solid #3b5bdb; outline-offset: 2px; }
.menu__enlace--activo { background: #edf2ff; color: #3b5bdb; font-weight: 600; }

/* Barra indicadora de la sección activa */
.menu__enlace::before {
  content: "";
  position: absolute;
  left: 0;
  top: 22%;
  bottom: 22%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: #3b5bdb;
  transform: scaleY(0);
  transition: transform 0.25s;
}
.menu__enlace--activo::before { transform: scaleY(1); }

.menu__icono {
  flex: 0 0 auto;
  width: 24px;
  text-align: center;
  font-size: 1.1rem;
  opacity: 0.7;
  transition: transform 0.2s, opacity 0.2s;
}
.menu__enlace:hover .menu__icono { transform: scale(1.18) rotate(-6deg); opacity: 1; }
.menu__enlace--activo .menu__icono { opacity: 1; }

.menu__texto {
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 0.2s, transform 0.2s;
}

/* Estado cerrado: solo iconos */
.sidebar--cerrado .menu__marca { gap: 0; justify-content: center; }
.sidebar--cerrado .menu__marca-texto { opacity: 0; max-width: 0; }
.sidebar--cerrado .menu__texto { opacity: 0; transform: translateX(-8px); }

/* ---------- Contenido ---------- */
.app__contenido {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}

.pagina { animation: pagina-entrada 0.35s cubic-bezier(0.2, 0.7, 0.3, 1) backwards; }

@keyframes pagina-entrada {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

@keyframes enlace-entrada {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: none; }
}

@media (max-width: 720px) {
  .menu { gap: 12px; }
  .menu__marca { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar, .menu__marca, .menu__marca-texto, .menu__enlace, .menu__icono, .menu__texto, .menu__enlace::before {
    transition: none;
  }
  .pagina, .menu__enlace { animation: none; }
}
`;

export default App;