import { useState } from "react";
import AdminUsuarios from "./AdminUsuarios";
import Usuarios from "./Usuarios";

function GestionUsuarios() {
  const [seccion, setSeccion] = useState("personas");

  return (
    <div className="gestion-usuarios">
      <nav className="gestion-usuarios__pestanas" aria-label="Gestión de usuarios">
        <button
          type="button"
          className={seccion === "personas" ? "activa" : ""}
          aria-pressed={seccion === "personas"}
          onClick={() => setSeccion("personas")}
        >
          Personas
        </button>
        <button
          type="button"
          className={seccion === "accesos" ? "activa" : ""}
          aria-pressed={seccion === "accesos"}
          onClick={() => setSeccion("accesos")}
        >
          Usuarios y accesos
        </button>
      </nav>

      {seccion === "personas" ? <Usuarios /> : <AdminUsuarios />}

      <style>{`
        .gestion-usuarios__pestanas { display: flex; gap: 8px; padding: 16px 24px 0; background: #f8fafc; }
        .gestion-usuarios__pestanas button { border: 1px solid #cbd5e1; border-radius: 8px 8px 0 0; padding: 10px 16px; background: #fff; color: #475569; font: inherit; font-weight: 600; cursor: pointer; }
        .gestion-usuarios__pestanas button.activa { border-color: #3b5bdb; color: #1d4ed8; box-shadow: inset 0 -2px #3b5bdb; }
      `}</style>
    </div>
  );
}

export default GestionUsuarios;
