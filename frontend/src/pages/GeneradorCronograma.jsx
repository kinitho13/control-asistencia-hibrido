import { useState } from "react";

function GeneradorCronograma() {

  const [mes, setMes] = useState(
    new Date().getMonth() + 1
  );

  const [anio, setAnio] = useState(
    new Date().getFullYear()
  );

  const generarCronograma = async () => {

    const response = await fetch(
      `http://localhost:8000/cronograma/generar-mes-v2?mes=${mes}&anio=${anio}`,
      {
        method: "POST"
      }
    );

    const data = await response.json();

    if (data.detail) {

      alert("❌ " + data.detail);

    } else {

      alert(
        `✅ Cronograma generado\n\nRegistros creados: ${data.registros_creados}`
      );

    }

  };

  return (

    <div>

      <h1>Generador de Cronograma</h1>

      <select
        value={mes}
        onChange={(e) =>
          setMes(Number(e.target.value))
        }
      >

        <option value={1}>Enero</option>
        <option value={2}>Febrero</option>
        <option value={3}>Marzo</option>
        <option value={4}>Abril</option>
        <option value={5}>Mayo</option>
        <option value={6}>Junio</option>
        <option value={7}>Julio</option>
        <option value={8}>Agosto</option>
        <option value={9}>Septiembre</option>
        <option value={10}>Octubre</option>
        <option value={11}>Noviembre</option>
        <option value={12}>Diciembre</option>

      </select>

      {" "}

      <input
        type="number"
        value={anio}
        onChange={(e) =>
          setAnio(Number(e.target.value))
        }
      />

      {" "}

      <button
        onClick={generarCronograma}
      >
        🚀 Generar Cronograma
      </button>

    </div>

  );
}

export default GeneradorCronograma;