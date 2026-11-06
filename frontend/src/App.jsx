import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";

import Login from "./pages/Login";
import { apiFetch } from "./config";
import Icono from "./components/Icono";
import logoControlAsistencia from "./assets/logo-control-asistencia.png";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const GestionUsuarios = lazy(() => import("./pages/GestionUsuarios"));
const Restricciones = lazy(() => import("./pages/Restricciones"));
const Festivos = lazy(() => import("./pages/Festivos"));
const Asistencias = lazy(() => import("./pages/Asistencias"));
const Calendario = lazy(() => import("./pages/Calendario"));
const Gantt = lazy(() => import("./pages/Gantt"));
const Reemplazos = lazy(() => import("./pages/Reemplazos"));
const Solicitudes = lazy(() => import("./pages/Solicitudes"));
const Notificaciones = lazy(() => import("./pages/Notificaciones"));
const Reportes = lazy(() => import("./pages/Reportes"));
const Auditoria = lazy(() => import("./pages/Auditoria"));
const Cierres = lazy(() => import("./pages/Cierres"));
const Marcaciones = lazy(() => import("./pages/Marcaciones"));

const ADMIN = "ADMIN";
const LIDER = "LIDER";
const USUARIO = "USUARIO";

const SECCIONES = [
  { ruta: "/", etiqueta: "Panel", roles: [ADMIN, LIDER, USUARIO], icono: "panel", componente: Dashboard, exacta: true },
  { ruta: "/usuarios", etiqueta: "Usuarios", roles: [ADMIN, LIDER], icono: "usuarios", componente: GestionUsuarios },
  { ruta: "/restricciones", etiqueta: "Restricciones", roles: [ADMIN], icono: "restricciones", componente: Restricciones },
  { ruta: "/festivos", etiqueta: "Festivos", roles: [ADMIN], icono: "festivos", componente: Festivos },
  { ruta: "/asistencias", etiqueta: "Asistencias", roles: [ADMIN, LIDER], icono: "asistencias", componente: Asistencias },
  { ruta: "/marcaciones", etiqueta: "Mi asistencia", roles: [ADMIN, LIDER, USUARIO], icono: "marcacion", componente: Marcaciones },
  { ruta: "/calendario", etiqueta: "Calendario", roles: [ADMIN, LIDER, USUARIO], icono: "calendario", componente: Calendario },
  { ruta: "/gantt", etiqueta: "Cronograma", roles: [ADMIN, LIDER, USUARIO], icono: "cronograma", componente: Gantt },
  { ruta: "/reemplazos", etiqueta: "Reemplazos", roles: [ADMIN, LIDER], icono: "reemplazos", componente: Reemplazos },
  { ruta: "/solicitudes", etiqueta: "Solicitudes", roles: [ADMIN, LIDER, USUARIO], icono: "solicitudes", componente: Solicitudes },
  { ruta: "/notificaciones", etiqueta: "Notificaciones", roles: [ADMIN, LIDER, USUARIO], icono: "notificaciones", componente: Notificaciones },
  { ruta: "/reportes", etiqueta: "Reportes", roles: [ADMIN, LIDER], icono: "reportes", componente: Reportes },
  { ruta: "/auditoria", etiqueta: "Historial", roles: [ADMIN, LIDER], icono: "historial", componente: Auditoria },
  { ruta: "/cierres", etiqueta: "Cierres", roles: [ADMIN], icono: "cierres", componente: Cierres },
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
    const usuario = guardado ? JSON.parse(guardado) : null;
    return usuario?.token ? usuario : null;
  } catch {
    return null;
  }
}

function seccionesPermitidas(rol) {
  return SECCIONES.filter((s) => s.roles.includes(rol));
}

function Menu({ rol, usuario, onNavigate }) {
  const [noLeidas, setNoLeidas] = useState(0);

  useEffect(() => {
    if (!usuario?.id) return undefined;
    const cargar = async () => {
      try {
        const respuesta = await apiFetch(`/notificaciones?usuario_id=${usuario.id}`);
        if (!respuesta.ok) return;
        const lista = await respuesta.json();
        setNoLeidas(lista.filter((aviso) => !aviso.leida).length);
      } catch {
        // El contador se actualiza cuando el servicio vuelva a estar disponible.
      }
    };
    cargar();
    const intervalo = window.setInterval(cargar, 30000);
    return () => window.clearInterval(intervalo);
  }, [usuario?.id]);

  return (
    <header className="menu">
      <div className="menu__marca">
      </div>

      <nav className="menu__enlaces">
        {seccionesPermitidas(rol).map(({ ruta, etiqueta, icono, exacta }, indice) => (
          <NavLink
            key={ruta}
            to={ruta}
            end={exacta}
            title={etiqueta}
            onClick={onNavigate}
            style={{ "--i": indice }}
            className={({ isActive }) => (isActive ? "menu__enlace menu__enlace--activo" : "menu__enlace")}
          >
            <Icono nombre={icono} className="menu__icono" />
            <span className="menu__texto">{etiqueta}</span>
            {ruta === "/notificaciones" && noLeidas > 0 && <span className="menu__contador">{noLeidas}</span>}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

/** Contenido con animación de entrada cada vez que cambia la ruta. */
function Contenido({ rol, usuario }) {
  const { pathname } = useLocation();

  return (
    <main className="app__contenido">
      <div key={pathname} className="pagina">
        <Suspense fallback={<div className="carga-pagina" role="status">Preparando la sección…</div>}>
          <Routes>
            {seccionesPermitidas(rol).map(({ ruta, componente: Pagina }) => (
              <Route key={ruta} path={ruta} element={<Pagina {...(ruta === "/" ? { usuario } : {})} />} />
            ))}

            {/* Rutas desconocidas o sin permiso vuelven al panel */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </main>
  );
}

function App() {
  const [usuarioLogueado, setUsuarioLogueado] = useState(leerUsuarioInicial);
  const [menuAbierto, setMenuAbierto] = useState(leerMenuInicial);
  const [entradaTrasLogin, setEntradaTrasLogin] = useState(false);
  const [saliendoSesion, setSaliendoSesion] = useState(false);
  const [mostrarBienvenida, setMostrarBienvenida] = useState(false);

  const rol = usuarioLogueado?.rol?.toUpperCase();

  const iniciarSesion = (usuario) => {
    try {
      localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
    } catch {
      /* localStorage no disponible */
    }
    setEntradaTrasLogin(true);
    setSaliendoSesion(false);
    setMostrarBienvenida(true);
    setUsuarioLogueado(usuario);
  };

  const cerrarSesion = () => {
    if (usuarioLogueado?.token) {
      apiFetch("/logout", { method: "POST" }).catch((error) => {
        console.error("No se pudo revocar la sesión en el servidor.", error);
      });
    }
    try {
      localStorage.removeItem(CLAVE_USUARIO);
    } catch {
      /* localStorage no disponible */
    }
    setEntradaTrasLogin(false);
    setMostrarBienvenida(false);
    setSaliendoSesion(true);
  };

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_MENU, menuAbierto ? "1" : "0");
    } catch {
      /* localStorage no disponible */
    }
  }, [menuAbierto]);

  useEffect(() => {
    const sesionExpirada = () => {
      try {
        localStorage.removeItem(CLAVE_USUARIO);
      } catch {
        /* localStorage no disponible */
      }
      setEntradaTrasLogin(false);
      setSaliendoSesion(true);
    };
    window.addEventListener("session-expired", sesionExpirada);
    return () => window.removeEventListener("session-expired", sesionExpirada);
  }, []);

  useEffect(() => {
    if (!entradaTrasLogin) return undefined;
    const temporizador = window.setTimeout(() => setEntradaTrasLogin(false), 1100);
    return () => window.clearTimeout(temporizador);
  }, [entradaTrasLogin]);

  useEffect(() => {
    if (!mostrarBienvenida) return undefined;
    const temporizador = window.setTimeout(() => setMostrarBienvenida(false), 3200);
    return () => window.clearTimeout(temporizador);
  }, [mostrarBienvenida]);

  useEffect(() => {
    if (!saliendoSesion) return undefined;
    const demora = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650;
    const temporizador = window.setTimeout(() => {
      setUsuarioLogueado(null);
      setSaliendoSesion(false);
    }, demora);
    return () => window.clearTimeout(temporizador);
  }, [saliendoSesion]);

  if (!usuarioLogueado) {
    return <Login onLogin={iniciarSesion} />;
  }

  return (
    <BrowserRouter>
      <style>{estilos}</style>

      <div
        className={`app${entradaTrasLogin ? " app--entrada" : ""}${saliendoSesion ? " app--salida" : ""}`}
        onAnimationEnd={(evento) => {
          if (evento.target === evento.currentTarget && evento.animationName === "aplicacion-salida") {
            setUsuarioLogueado(null);
            setSaliendoSesion(false);
          }
        }}
      >
        {mostrarBienvenida && (
          <div className="app__bienvenida" role="status" aria-live="polite">
            <Icono nombre="asistencias" className="app__bienvenida-icono" />
            <span>
              <strong>¡Bienvenido/a, {usuarioLogueado.nombre}!</strong>
              <small>Sesión iniciada correctamente</small>
            </span>
          </div>
        )}
        <aside className={menuAbierto ? "sidebar" : "sidebar sidebar--cerrado"}>
          <button
            className="sidebar__toggle"
            onClick={() => setMenuAbierto((abierto) => !abierto)}
            aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuAbierto}
          >
            <Icono nombre="menu" className="menu__toggle-icono" />
          </button>

          <Menu
            rol={rol}
            usuario={usuarioLogueado}
            onNavigate={() => {
              if (window.matchMedia("(max-width: 720px)").matches) setMenuAbierto(false);
            }}
          />

          <button className="sidebar__salir" onClick={cerrarSesion} title="Salir">
            <Icono nombre="salir" className="menu__icono" />
            <span className="menu__texto">Salir</span>
          </button>
        </aside>

        <Contenido rol={rol} usuario={usuarioLogueado} />
      </div>
    </BrowserRouter>
  );
}

const estilos = `
body { margin: 0; display: block; min-width: 320px; background: #050816; }
#root { width: 100%; max-width: none; min-height: 100vh; margin: 0; padding: 0; text-align: left; box-sizing: border-box; }

.app {
  position: relative;
  isolation: isolate;
  display: flex;
  width: 100%;
  max-width: 100vw;
  min-height: 100vh;
  font-family: var(--sans);
  background:
    radial-gradient(ellipse at 82% 0%, rgba(45, 212, 191, 0.08), transparent 36%),
    radial-gradient(ellipse at 14% 82%, rgba(139, 92, 246, 0.055), transparent 38%),
    #050816;
  box-sizing: border-box;
}

.app--entrada {
  animation: aplicacion-entrada 0.85s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.app--salida {
  pointer-events: none;
  animation: aplicacion-salida 0.58s cubic-bezier(0.55, 0, 1, 0.45) both;
}
.app--entrada::after {
  position: fixed;
  z-index: 1100;
  inset: 0;
  pointer-events: none;
  content: "";
  background: radial-gradient(ellipse at center, rgba(94, 234, 212, 0.2), rgba(96, 165, 250, 0.08) 32%, transparent 68%);
  animation: destello-bienvenida 1.05s ease-out both;
}

.app__bienvenida {
  position: fixed;
  z-index: 1200;
  top: 20px;
  right: 22px;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(390px, calc(100vw - 32px));
  padding: 14px 18px;
  border: 1px solid rgba(94, 234, 212, 0.3);
  border-radius: 16px;
  color: #f8fafc;
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.88), rgba(15, 40, 55, 0.76));
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.34), inset 0 1px rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(18px) saturate(130%);
  -webkit-backdrop-filter: blur(18px) saturate(130%);
  animation: bienvenida-entrada 0.35s ease-out both;
}
.app__bienvenida span { display: grid; gap: 2px; }
.app__bienvenida strong { font-size: 0.98rem; }
.app__bienvenida small { color: #cbd5e1; font-size: 0.8rem; }
.app__bienvenida-icono { flex: 0 0 auto; width: 24px; height: 24px; color: #5eead4; }

@keyframes bienvenida-entrada {
  from { opacity: 0; transform: translateY(-8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes aplicacion-entrada {
  from { opacity: 0; filter: blur(10px); transform: translateY(18px) scale(0.975); }
  62% { opacity: 1; filter: blur(0); transform: translateY(-2px) scale(1.003); }
  to { opacity: 1; filter: none; transform: none; }
}

@keyframes aplicacion-salida {
  from { opacity: 1; filter: blur(0); transform: translateY(0) scale(1); }
  to { opacity: 0; filter: blur(8px); transform: translateY(-12px) scale(0.98); }
}

@keyframes destello-bienvenida {
  from { opacity: 0; transform: scale(0.72); }
  34% { opacity: 1; }
  to { opacity: 0; transform: scale(1.12); }
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
  background: linear-gradient(165deg, rgba(15, 23, 42, 0.86), rgba(5, 8, 22, 0.9));
  border-right: 1px solid rgba(255, 255, 255, 0.13);
  box-shadow: 12px 0 36px rgba(0, 0, 0, 0.2), inset -1px 0 rgba(255, 255, 255, 0.035);
  backdrop-filter: blur(22px) saturate(135%);
  -webkit-backdrop-filter: blur(22px) saturate(135%);
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
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 1.1rem;
  color: #e2e8f0;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, transform 0.15s;
}
.sidebar__toggle:hover { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.25); }
.sidebar__toggle:active { transform: scale(0.96); }
.sidebar__toggle:focus-visible { outline: 2px solid #cbd5e1; outline-offset: 2px; }
.menu__toggle-icono { width: 21px; height: 21px; vertical-align: middle; }

/* ---------- Botón salir ---------- */
.sidebar__salir {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: auto;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.045);
  font-size: 0.9rem;
  font-weight: 500;
  color: #b8c1d9;
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}
.sidebar__salir:hover { background: rgba(127, 29, 29, 0.28); color: #fecaca; border-color: rgba(252, 165, 165, 0.3); }
.sidebar__salir:focus-visible { outline: 2px solid #cbd5e1; outline-offset: 2px; }

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
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  transition: gap 0.3s;
}

.menu__logo {
  flex: 0 0 auto;
  display: block;
  width: 40px;
  height: 40px;
  object-fit: contain;
  filter: drop-shadow(0 4px 10px rgba(139, 92, 246, 0.32));
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
  color: #b8c1d9;
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  transition: background-color 0.15s, color 0.15s, transform 0.2s;
  animation: enlace-entrada 0.4s cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
  animation-delay: calc(var(--i, 0) * 40ms);
}
.menu__enlace:hover { background: rgba(255, 255, 255, 0.08); color: #ffffff; transform: translateX(3px); }
.menu__enlace:focus-visible { outline: 2px solid #cbd5e1; outline-offset: 2px; }
.menu__enlace--activo { background: linear-gradient(100deg, rgba(45, 212, 191, 0.15), rgba(96, 165, 250, 0.08)); color: #ffffff; font-weight: 600; }

/* Barra indicadora de la sección activa */
.menu__enlace::before {
  content: "";
  position: absolute;
  left: 0;
  top: 22%;
  bottom: 22%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, #5eead4, #60a5fa);
  transform: scaleY(0);
  transition: transform 0.25s;
}
.menu__enlace--activo::before { transform: scaleY(1); }

.menu__icono {
  flex: 0 0 auto;
  display: block;
  width: 22px;
  height: 22px;
  color: currentColor;
  opacity: 0.8;
  transition: transform 0.2s, opacity 0.2s;
}
.menu__contador { margin-left: auto; min-width: 19px; padding: 2px 5px; border-radius: 999px; color: #fff; background: #be123c; text-align: center; font-size: .7rem; font-weight: 700; }
.sidebar--cerrado .menu__contador { position: absolute; top: 2px; right: 0; min-width: 14px; padding: 1px 3px; font-size: .6rem; }
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
  flex: 1 1 0;
  width: 0;
  min-width: 0;
  overflow-x: auto;
}

.pagina {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  transform-origin: top center;
  animation: pagina-entrada 0.42s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

.carga-pagina {
  display: grid;
  min-height: 45vh;
  place-items: center;
  color: #b8c1d9;
}

@keyframes pagina-entrada {
  from { opacity: 0; filter: blur(4px); transform: translateY(12px) scale(0.992); }
  to { opacity: 1; filter: blur(0); transform: translateY(0) scale(1); }
}

@keyframes enlace-entrada {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: none; }
}

@media (max-width: 720px) {
  .sidebar {
    position: fixed;
    z-index: 1000;
    top: 10px;
    bottom: 10px;
    left: 10px;
    width: 58px;
    min-width: 58px;
    height: auto;
    padding: 10px 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 18px;
    backdrop-filter: blur(22px);
    -webkit-backdrop-filter: blur(22px);
  }
  .sidebar:not(.sidebar--cerrado) {
    width: min(280px, calc(100vw - 24px));
    min-width: min(280px, calc(100vw - 24px));
  }
  .sidebar--cerrado .menu__marca { display: none; }
  .sidebar:not(.sidebar--cerrado) .menu__marca { display: flex; }
  .sidebar .menu__enlaces { overflow-y: auto; }
  .sidebar:not(.sidebar--cerrado) { box-shadow: 18px 0 48px rgba(0, 0, 0, 0.48); }
  .sidebar__toggle { height: 42px; }
  .sidebar__salir { justify-content: center; padding-inline: 8px; }
  .sidebar:not(.sidebar--cerrado) .sidebar__salir { justify-content: flex-start; padding-inline: 12px; }
  .app__contenido { width: 100%; padding-left: 70px; box-sizing: border-box; }
}

/* Tema compartido para formularios, tablas y paneles de todas las secciones. */
.app .pagina {
  min-width: 0;
  color: #f8fafc;
}

.app .pagina > * {
  min-width: 0;
  max-width: 100%;
}

.app .pagina h1 {
  margin: 0 0 14px !important;
  line-height: 1.2;
}

.app .pagina h1 + p {
  margin-top: 0 !important;
  line-height: 1.5;
}

.app .pagina :is(.tabla-contenedor, .adm__items, .gen__tabla-scroll, .rem__tabla-scroll, .calendario__contenedor) {
  min-width: 0;
  max-width: 100%;
}

.app .pagina :is(.usuarios, .restricciones, .festivos, .calendario, .gantt, .adm, .gen, .rem, .solicitudes, .notificaciones, .reportes, .auditoria, .cierres) {
  --tinta: #f1f5f9;
  --tinta-suave: #b8c1d9;
  --linea: rgba(255, 255, 255, 0.13);
  --fondo: #050816;
  --superficie: rgba(255, 255, 255, 0.065);
  --primario: #2dd4bf;
  --primario-oscuro: #0f766e;
  color: #f1f5f9;
  background:
    radial-gradient(ellipse at 82% 0%, rgba(45, 212, 191, 0.055), transparent 38%),
    radial-gradient(ellipse at 4% 100%, rgba(59, 130, 246, 0.07), transparent 34%),
    linear-gradient(135deg, #030712, #050816 55%, #111827) !important;
}

.app .pagina :is(.usuarios, .restricciones, .festivos, .calendario, .gantt, .adm, .gen, .rem, .solicitudes, .notificaciones, .reportes, .auditoria, .cierres) h1,
.app .pagina :is(.usuarios, .restricciones, .festivos, .calendario, .gantt, .adm, .gen, .rem, .solicitudes, .notificaciones, .reportes, .auditoria, .cierres) h2,
.app .pagina .adm :is(.adm__titulo, .adm__nombre) {
  color: #f8fafc !important;
}

.app .pagina :is(.usuarios, .restricciones, .festivos, .adm, .gen, .rem, .solicitudes, .notificaciones, .reportes, .auditoria, .cierres, .calendario, .gantt) :is(.tarjeta, .adm__panel, .gen__panel, .rem__panel, .solicitudes__form, .solicitudes__lista, .notificaciones__item, .reportes__filtros, .reportes__resumen article, .reportes__resultado, .auditoria__filtros, .auditoria__lista, .cierres__form, .cierres__lista, .calendario__contenedor, .tabla-contenedor) {
  color: #f1f5f9;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.105), rgba(255, 255, 255, 0.045)) !important;
  border-color: rgba(255, 255, 255, 0.16) !important;
  border-radius: 16px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22), inset 0 1px rgba(255, 255, 255, 0.09) !important;
  backdrop-filter: blur(18px) saturate(125%);
  -webkit-backdrop-filter: blur(18px) saturate(125%);
}

.app .pagina :is(.panel-lider, .dashboard .resumen__item) {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.035));
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.18), inset 0 1px rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(16px) saturate(120%);
  -webkit-backdrop-filter: blur(16px) saturate(120%);
}

.app .pagina :is(.tarjeta__titulo, .contador, .adm__etiqueta, .adm__item-nombre, .adm__nombre, .gen__titulo, .gen__subtitulo, .rem__titulo, .rem__subtitulo, .solicitudes__titulo, .reportes__titulo-tabla) {
  color: #f1f5f9 !important;
}

.app .pagina :is(.adm__subtitulo, .usuarios__subtitulo, .restricciones__subtitulo, .festivos__subtitulo, .calendario__subtitulo, .gantt__subtitulo, .reportes header p, .solicitudes header p, .auditoria header p, .cierres header p) {
  color: #b8c1d9 !important;
}

.app .pagina :is(.adm__panel, .tarjeta, .gen__panel, .rem__panel, .solicitudes__form, .solicitudes__lista, .notificaciones__item, .reportes__filtros, .reportes__resumen article, .reportes__resultado, .auditoria__filtros, .auditoria__lista, .cierres__form, .cierres__lista, .calendario__contenedor, .tabla-contenedor) {
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.app .pagina :is(.tarjeta, .adm__panel, .gen__panel, .rem__panel, .solicitudes__form, .solicitudes__lista, .notificaciones__item, .reportes__filtros, .reportes__resumen article, .reportes__resultado, .auditoria__filtros, .auditoria__lista, .cierres__form, .cierres__lista, .calendario__contenedor, .tabla-contenedor, .panel-lider, .dashboard .resumen__item):hover {
  border-color: rgba(94, 234, 212, 0.32) !important;
  box-shadow: 0 20px 46px rgba(0, 0, 0, 0.24), inset 0 1px rgba(255, 255, 255, 0.1) !important;
}

.app .pagina :is(.solicitudes__form, .solicitudes__lista, .notificaciones__item, .reportes__filtros, .reportes__resumen article, .reportes__resultado, .auditoria__filtros, .auditoria__lista, .cierres__form, .cierres__lista) {
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.2), inset 0 1px rgba(255, 255, 255, 0.06) !important;
}

.app .pagina :is(.solicitudes__form > button, .solicitudes__acciones button:not(.solicitudes__rechazar), .notificaciones header button, .reportes__filtros button, .auditoria__filtros button, .cierres__form button) {
  color: #f8fafc !important;
  background: linear-gradient(135deg, #0f766e, #2563eb) !important;
  border: 1px solid rgba(94, 234, 212, 0.28) !important;
  border-radius: 9px;
  transition: transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease;
}
.app .pagina :is(.solicitudes__form > button, .solicitudes__acciones button:not(.solicitudes__rechazar), .notificaciones header button, .reportes__filtros button, .auditoria__filtros button, .cierres__form button):hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.1);
  box-shadow: 0 8px 20px rgba(15, 118, 110, 0.2);
}

.app .pagina :is(.reportes table, .solicitudes__item) { color: #e2e8f0; }
.app .pagina .reportes th { color: #cbd5e1; }
.app .pagina .reportes td { color: #e2e8f0; }

.app .pagina :is(.usuarios, .restricciones, .festivos, .adm, .gen, .rem, .solicitudes, .notificaciones, .reportes, .auditoria, .cierres, .calendario, .gantt) :is(input:not([type="checkbox"]):not([type="radio"]), select, textarea, .entrada-tabla, .adm__input, .gen__campo input, .gen__campo select, .rem__campo input, .rem__campo select, .rem__filtros input, .rem__filtros select, .rem__persona input) {
  color: #f8fafc !important;
  background: rgba(5, 8, 22, 0.72) !important;
  border-color: rgba(255, 255, 255, 0.16) !important;
}

.app .pagina :is(.usuarios, .restricciones, .festivos, .adm, .gen, .rem, .solicitudes, .notificaciones, .reportes, .auditoria, .cierres, .calendario, .gantt) :is(input, select, textarea)::placeholder {
  color: #94a3b8;
}
.app .pagina :is(.usuarios, .restricciones, .festivos, .adm, .gen, .rem, .solicitudes, .notificaciones, .reportes, .auditoria, .cierres, .calendario, .gantt) input[type="checkbox"],
.app .pagina :is(.usuarios, .restricciones, .festivos, .adm, .gen, .rem, .solicitudes, .notificaciones, .reportes, .auditoria, .cierres, .calendario, .gantt) input[type="radio"] { accent-color: #2dd4bf; }

.app .pagina :is(.usuarios, .restricciones, .festivos, .adm, .gen, .rem, .solicitudes, .notificaciones, .reportes, .auditoria, .cierres, .calendario, .gantt) select option {
  color: #e2e8f0;
  background: #0f172a;
}

.app .pagina :is(.campo, .gen__campo, .rem__campo, .adm__etiqueta, .adm__item-sub, .adm__subtitulo, .rem__ayuda, .gen__ayuda, .rem__vacio, .gen__vacio, .adm__vacio, .adm__placeholder, .adm__item-sub, .confirmacion, .adm__placeholder p) {
  color: #b8c1d9 !important;
}

.app .pagina :is(.boton, .adm__boton, .gen__boton, .rem__boton) {
  border-color: rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  transition: transform 0.18s, background 0.18s, border-color 0.18s;
}

.app .pagina :is(.boton--primario, .adm__boton:not(.adm__boton--sec), .gen__boton--principal, .rem__boton--principal) {
  color: #fff !important;
  background: linear-gradient(135deg, #0f766e, #2563eb) !important;
  border-color: rgba(255, 255, 255, 0.18) !important;
}

.app .pagina :is(.boton--suave, .adm__boton--sec, .gen__boton:not(.gen__boton--principal):not(.gen__boton--peligro), .rem__boton:not(.rem__boton--principal):not(.rem__boton--peligro)) {
  color: #e2e8f0 !important;
  background: rgba(255, 255, 255, 0.06) !important;
  border-color: rgba(255, 255, 255, 0.14) !important;
}

.app .pagina :is(.boton, .adm__boton, .gen__boton, .rem__boton):hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.12);
}

.app .pagina :is(.tabla-contenedor, .adm__items, .gen__tabla-scroll, .rem__tabla-scroll) {
  border-color: rgba(255, 255, 255, 0.13) !important;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035) !important;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.18);
}

.app .pagina :is(.tabla, .gen__tabla, .rem__tabla) {
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.1) !important;
}

.app .pagina :is(.tabla, .gen__tabla, .rem__tabla) :is(th, td) {
  color: #dbe4f0;
  border-color: rgba(255, 255, 255, 0.09) !important;
}

.app .pagina :is(.tabla, .gen__tabla, .rem__tabla) thead th {
  color: #cbd5e1 !important;
  background: rgba(148, 163, 184, 0.12) !important;
}

.app .pagina :is(.tabla, .gen__tabla, .rem__tabla) tbody tr:hover td,
.app .pagina :is(.tabla, .gen__tabla, .rem__tabla) tbody tr:hover th {
  background: rgba(148, 163, 184, 0.2);
  transition: background-color 0.15s ease;
}

.app .pagina .tabla__usuario,
.app .pagina .gen__nombre {
  color: #e2e8f0 !important;
  background: #111827 !important;
}

.app .pagina .tabla__dia { color: #e2e8f0; background: #101827; }
.app .pagina .tabla__dia.es-lunes { background: #1d1b16; }
.app .pagina .tabla__dia.es-finde { background: #111827; }
.app .pagina .tabla__dia.es-festivo { color: #fda4af; background: #3b1722; }
.app .pagina .tabla__total { color: #cbd5e1; background: #0f172a; }
.app .pagina .celda--finde { background: #111827; }
.app .pagina .celda--casa { background: #0f766e; }
.app .pagina .celda--oficina { background: #1d4ed8; }
.app .pagina .celda--festivo { background: #9f1239; }
.app .pagina .celda--reemplazo { background: #b45309; }

.app .pagina :is(.gen__editor, .rem__editor) {
  color: #e2e8f0;
  background: rgba(5, 8, 22, 0.62) !important;
  border-color: rgba(255, 255, 255, 0.13) !important;
}

.app .pagina :is(.gen__celda--casa, .gen__celda--oficina) {
  color: #e0f2fe;
  background: rgba(59, 130, 246, 0.22);
}

.app .pagina :is(.aviso--ok, .adm__aviso--ok, .gen__mensaje--ok, .rem__mensaje--ok) {
  color: #a7f3d0 !important;
  background: rgba(6, 78, 59, 0.32) !important;
  border-color: rgba(110, 231, 183, 0.24) !important;
}

.app .pagina :is(.aviso--error, .adm__aviso--error, .gen__mensaje--error, .rem__mensaje--error) {
  color: #fecaca !important;
  background: rgba(127, 29, 29, 0.28) !important;
  border-color: rgba(252, 165, 165, 0.24) !important;
}

.app .pagina .contador,
.app .pagina .adm__item--activo,
.app .pagina .rem__fila--activa td {
  color: #e2e8f0 !important;
  background: rgba(148, 163, 184, 0.16) !important;
  border-color: rgba(203, 213, 225, 0.2) !important;
}

.app .pagina .adm__item { color: #e2e8f0; }
.app .pagina .adm__item:hover { background: rgba(255, 255, 255, 0.07); }
.app .pagina .adm__avatar { background: linear-gradient(135deg, #64748b, #334155); }
.app .pagina .adm__chip--ok { color: #a7f3d0; background: rgba(6, 78, 59, 0.35); }
.app .pagina .adm__chip--bloq { color: #fecaca; background: rgba(127, 29, 29, 0.35); }

.app .pagina .gestion-usuarios { min-height: 100vh; background: #050816; }
.app .pagina .gestion-usuarios__pestanas {
  padding: 18px clamp(16px, 4vw, 48px) 0;
  background: transparent !important;
}
.app .pagina .gestion-usuarios__pestanas button {
  color: #b8c1d9 !important;
  background: rgba(255, 255, 255, 0.05) !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
}
.app .pagina .gestion-usuarios__pestanas button.activa {
  color: #fff !important;
  background: rgba(148, 163, 184, 0.16) !important;
  border-color: rgba(203, 213, 225, 0.24) !important;
}

.app .pagina .calendario .fc {
  --fc-page-bg-color: transparent;
  --fc-neutral-bg-color: rgba(255, 255, 255, 0.04);
  --fc-neutral-text-color: #b8c1d9;
  --fc-border-color: rgba(255, 255, 255, 0.12);
  --fc-today-bg-color: rgba(148, 163, 184, 0.1);
  --fc-button-bg-color: rgba(255, 255, 255, 0.07);
  --fc-button-border-color: rgba(255, 255, 255, 0.15);
  --fc-button-text-color: #e2e8f0;
  --fc-button-hover-bg-color: rgba(255, 255, 255, 0.14);
  --fc-button-hover-border-color: rgba(255, 255, 255, 0.24);
  --fc-button-active-bg-color: rgba(148, 163, 184, 0.24);
  --fc-button-active-border-color: rgba(203, 213, 225, 0.32);
  color: #e2e8f0;
}
.app .pagina .calendario .fc .fc-toolbar-title,
.app .pagina .calendario .fc .fc-col-header-cell-cushion,
.app .pagina .calendario .fc .fc-daygrid-day-number { color: #e2e8f0 !important; }
.app .pagina .calendario .fc .dia-festivo { background: rgba(159, 18, 57, 0.2); }
.app .pagina .calendario .fc .dia-festivo .fc-daygrid-day-number { color: #fda4af !important; }
.app .pagina .calendario__contenedor {
  background: rgba(255, 255, 255, 0.045) !important;
  border-color: rgba(255, 255, 255, 0.13) !important;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
}
.app .pagina .calendario .nota { color: #fde68a; background: rgba(120, 53, 15, 0.25); border-color: rgba(253, 230, 138, 0.2); }
.app .pagina .notificaciones__item.no-leida {
  border-color: rgba(96, 165, 250, 0.4) !important;
  background: linear-gradient(110deg, rgba(59, 130, 246, 0.13), rgba(255, 255, 255, 0.045)) !important;
}

.app .pagina .gantt .tabla-contenedor,
.app .pagina .gen__tabla-scroll,
.app .pagina .rem__tabla-scroll { max-width: 100%; }

@media (max-width: 720px) {
  .app__bienvenida { top: 12px; right: 12px; }
  .app__contenido { overflow-x: hidden; }
  .app .pagina :is(.usuarios, .restricciones, .festivos, .calendario, .gantt, .gen, .rem, .solicitudes, .notificaciones, .reportes, .auditoria, .cierres) {
    min-height: 100dvh;
    padding: 22px 14px 28px;
  }
  .app .pagina .adm { padding: 20px 14px; }
  .app .pagina .adm__layout { grid-template-columns: minmax(0, 1fr); }
  .app .pagina .gestion-usuarios__pestanas { padding-inline: 14px; }
  .app .pagina .gestion-usuarios__pestanas button { flex: 1; padding-inline: 8px; }
  .app .pagina :is(.tarjeta, .adm__panel, .gen__panel, .rem__panel) { padding: 16px; }
  .app .pagina :is(.formulario, .gen__formulario, .rem__formulario) { align-items: stretch; }
  .app .pagina .calendario__contenedor { padding: 12px; }
  .app .pagina .calendario .fc .fc-toolbar { flex-direction: column; gap: 10px; }
  .app .pagina .calendario .fc .fc-toolbar-chunk { display: flex; justify-content: center; flex-wrap: wrap; }
  .app .pagina .calendario .fc .fc-toolbar-title { font-size: 1.1rem; }
  .app .pagina .gantt__controles { width: 100%; }
  .app .pagina :is(.tabla-contenedor, .gen__tabla-scroll, .rem__tabla-scroll, .reportes__tabla-scroll, .auditoria__lista) {
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .app .pagina :is(.solicitudes__item, .notificaciones__item, .cierres__lista article) { flex-wrap: wrap; }
}

@media (prefers-reduced-motion: reduce) {
  .app--entrada, .app--entrada::after, .app--salida { animation: none; }
  .app__bienvenida { animation: none; }
  .sidebar, .menu__marca, .menu__marca-texto, .menu__enlace, .menu__icono, .menu__texto, .menu__enlace::before {
    transition: none;
  }
  .app .pagina :is(.tarjeta, .adm__panel, .gen__panel, .rem__panel, .solicitudes__form, .solicitudes__lista, .notificaciones__item, .reportes__filtros, .reportes__resumen article, .reportes__resultado, .auditoria__filtros, .auditoria__lista, .cierres__form, .cierres__lista, .calendario__contenedor, .tabla-contenedor, .solicitudes__form > button, .solicitudes__acciones button, .notificaciones header button, .reportes__filtros button, .auditoria__filtros button, .cierres__form button) {
    transition: none;
  }
  .pagina, .menu__enlace { animation: none; }
}
`;

export default App;