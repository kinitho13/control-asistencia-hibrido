import { NavLink } from "react-router-dom";

const ENLACES = [
  { ruta: "/", etiqueta: "Panel", exacta: true },
  { ruta: "/usuarios", etiqueta: "Usuarios" },
  { ruta: "/restricciones", etiqueta: "Restricciones" },
  { ruta: "/festivos", etiqueta: "Festivos" },
  { ruta: "/asistencias", etiqueta: "Asistencias" },
  { ruta: "/calendario", etiqueta: "Calendario" },
  { ruta: "/gantt", etiqueta: "Cronograma" },
  { ruta: "/reemplazos", etiqueta: "Reemplazos" },
  { ruta: "/suplentes", etiqueta: "Suplentes" }
];

function Menu() {
  return (
    <header className="menu">
      <style>{estilos}</style>

      <span className="menu__marca">Control de asistencia</span>

      <nav className="menu__enlaces" aria-label="Principal">
        {ENLACES.map(({ ruta, etiqueta, exacta }) => (
          <NavLink
            key={ruta}
            to={ruta}
            end={exacta}
            className={({ isActive }) =>
              isActive ? "menu__enlace menu__enlace--activo" : "menu__enlace"
            }
          >
            {etiqueta}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

const estilos = `
.menu {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 24px;
  height: 60px;
  padding: 0 clamp(16px, 4vw, 48px);
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  box-sizing: border-box;
  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
}

.menu__marca {
  flex: 0 0 auto;
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: -0.01em;
  color: #1e293b;
}

.menu__enlaces {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: thin;
  width: 100%;
}
.menu__enlaces::-webkit-scrollbar { display: none; }

.menu__enlace {
  flex: 0 0 auto;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  color: #64748b;
  text-decoration: none;
  transition: background-color 0.15s, color 0.15s;
}
.menu__enlace:hover { background: #f1f5f9; color: #1e293b; }
.menu__enlace:focus-visible { outline: 2px solid #3b5bdb; outline-offset: 2px; }
.menu__enlace--activo { background: #edf2ff; color: #3b5bdb; font-weight: 600; }

@media (max-width: 720px) {
  .menu { gap: 12px; }
  .menu__marca { display: none; }
}
`;

export default Menu;