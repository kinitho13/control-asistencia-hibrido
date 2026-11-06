export default function FiltroPersonas({
  usuarios,
  seleccionados,
  onSeleccionarPrincipales,
  onSeleccionarTodos,
  onAlternarPersona,
}) {
  return (
    <section className="filtro-personas" aria-label="Filtrar personas">
      <div className="filtro-personas__acciones">
        <span className="filtro-personas__titulo">Personas visibles</span>
        <button type="button" onClick={onSeleccionarPrincipales}>
          Principales
        </button>
        <button type="button" onClick={onSeleccionarTodos}>
          Ver todos
        </button>
      </div>

      <details className="filtro-personas__detalle">
        <summary>
          Personalizar ({seleccionados.length} de {usuarios.length})
        </summary>
        <div className="filtro-personas__lista">
          {usuarios.map((usuario) => (
            <label key={usuario}>
              <input
                type="checkbox"
                checked={seleccionados.includes(usuario)}
                onChange={() => onAlternarPersona(usuario)}
              />
              {usuario}
            </label>
          ))}
          {usuarios.length === 0 && <span>No hay personas con asistencias.</span>}
        </div>
      </details>

      <style>{`
        .filtro-personas { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; color: #e2e8f0; }
        .filtro-personas__acciones { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .filtro-personas__titulo { color: #b8c1d9; font-size: 0.85rem; font-weight: 600; }
        .filtro-personas button { border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 7px; padding: 7px 10px; color: #e2e8f0; background: rgba(255, 255, 255, 0.06); font: inherit; cursor: pointer; transition: background-color 0.15s, border-color 0.15s; }
        .filtro-personas button:hover { background: rgba(148, 163, 184, 0.2); border-color: rgba(203, 213, 225, 0.3); }
        .filtro-personas__detalle { position: relative; color: #e2e8f0; font-size: 0.9rem; }
        .filtro-personas__detalle summary { color: #f1f5f9; cursor: pointer; font-weight: 600; }
        .filtro-personas__detalle summary:hover { color: #ffffff; }
        .filtro-personas__detalle summary:focus-visible { outline: 2px solid #cbd5e1; outline-offset: 3px; border-radius: 3px; }
        .filtro-personas__lista { position: absolute; z-index: 10; top: calc(100% + 8px); right: 0; display: grid; gap: 8px; min-width: 220px; max-height: 260px; overflow: auto; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 8px; color: #e2e8f0; background: #0f172a; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.38); }
        .filtro-personas__lista label { display: flex; align-items: center; gap: 8px; }
        .filtro-personas__lista label:hover { color: #ffffff; }
        @media print { .filtro-personas { display: none !important; } }
      `}</style>
    </section>
  );
}
