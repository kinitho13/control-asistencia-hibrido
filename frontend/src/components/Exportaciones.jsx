import { useState } from "react";

async function exportarExcel(nombreArchivo, nombreHoja, filas) {
  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();
  const hoja = XLSX.utils.json_to_sheet(filas);
  XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);
  XLSX.writeFile(libro, `${nombreArchivo}.xlsx`);
}

function imprimirPdf(titulo) {
  const tituloAnterior = document.title;
  const restaurarTitulo = () => {
    document.title = tituloAnterior;
    window.removeEventListener("afterprint", restaurarTitulo);
  };

  document.title = titulo;
  window.addEventListener("afterprint", restaurarTitulo);
  window.print();
}

export default function Exportaciones({ nombreArchivo, nombreHoja, tituloPdf, filas }) {
  const [error, setError] = useState("");
  const deshabilitado = filas.length === 0;

  const manejarExcel = async () => {
    setError("");
    try {
      await exportarExcel(nombreArchivo, nombreHoja, filas);
    } catch {
      setError("No se pudo generar el archivo Excel.");
    }
  };

  const manejarPdf = () => {
    setError("");
    try {
      imprimirPdf(tituloPdf);
    } catch {
      setError("No se pudo abrir la ventana para guardar el PDF.");
    }
  };

  return (
    <div className="exportaciones">
      <button
        type="button"
        disabled={deshabilitado}
        onClick={manejarExcel}
      >
        Exportar Excel
      </button>
      <button
        type="button"
        disabled={deshabilitado}
        onClick={manejarPdf}
      >
        Exportar PDF
      </button>
      {error && <span className="exportaciones__error" role="alert">{error}</span>}
      <style>{`
        .exportaciones { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .exportaciones button { border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 8px; padding: 7px 10px; color: #e2e8f0; background: rgba(255, 255, 255, 0.06); font: inherit; cursor: pointer; transition: background-color 0.15s, border-color 0.15s; }
        .exportaciones button:hover:not(:disabled) { background: rgba(148, 163, 184, 0.2); border-color: rgba(203, 213, 225, 0.3); }
        .exportaciones button:disabled { cursor: not-allowed; opacity: 0.5; }
        .exportaciones__error { color: #fecaca; font-size: 0.85rem; }
        @media (prefers-reduced-motion: reduce) { .exportaciones button { transition: none; } }
        @media print {
          body * { visibility: hidden !important; }
          #reporte-exportable, #reporte-exportable * { visibility: visible !important; }
          .app { display: block !important; }
          .sidebar { display: none !important; }
          .app__contenido, .pagina { overflow: visible !important; }
          #reporte-exportable { position: static !important; width: 100%; min-height: 0 !important; padding: 12px !important; background: #fff !important; }
          #reporte-exportable .tabla-contenedor { overflow: visible !important; }
          .exportaciones, .filtro-personas { display: none !important; }
          @page { size: landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}
