import { useMemo, useState } from "react";

const STORAGE_KEY = "asistencia.personasVisibles";
const PERSONAS_PRINCIPALES = new Set(["cristian", "rene", "juan", "fabian", "diego"]);

function normalizar(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function esPersonaPrincipal(nombre) {
  return normalizar(nombre)
    .split(/\s+/)
    .some((parte) => PERSONAS_PRINCIPALES.has(parte));
}

function leerPreferencia() {
  try {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado === null) return null;

    const personas = JSON.parse(guardado);
    return Array.isArray(personas) && personas.every((persona) => typeof persona === "string")
      ? personas
      : null;
  } catch {
    return null;
  }
}

export function useFiltroPersonas(usuarios) {
  const [preferencia, setPreferencia] = useState(leerPreferencia);

  const personasSeleccionadas = useMemo(() => {
    const seleccion = preferencia ?? usuarios.filter(esPersonaPrincipal);
    return seleccion.filter((persona) => usuarios.includes(persona));
  }, [preferencia, usuarios]);

  const guardarSeleccion = (personas) => {
    setPreferencia(personas);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(personas));
    } catch {
      // El filtro sigue funcionando aunque el navegador no permita persistirlo.
    }
  };

  return {
    personasSeleccionadas,
    seleccionarPrincipales: () => guardarSeleccion(usuarios.filter(esPersonaPrincipal)),
    seleccionarTodos: () => guardarSeleccion(usuarios),
    alternarPersona: (nombre) => {
      const siguiente = personasSeleccionadas.includes(nombre)
        ? personasSeleccionadas.filter((persona) => persona !== nombre)
        : [...personasSeleccionadas, nombre];
      guardarSeleccion(siguiente);
    },
  };
}
