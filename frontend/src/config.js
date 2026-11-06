const apiHost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "localhost"
    : window.location.hostname;

export const API_URL = (
  import.meta.env.VITE_API_URL || `http://${apiHost}:8000`
).replace(/\/+$/, "");

export async function apiFetch(ruta, opciones = {}) {
  const headers = new Headers(opciones.headers || {});
  try {
    const sesion = JSON.parse(localStorage.getItem("usuario") || "null");
    if (sesion?.token) headers.set("Authorization", `Bearer ${sesion.token}`);
  } catch {
    // Las rutas protegidas responderán con 401 si el estado local no es válido.
  }
  const respuesta = await fetch(`${API_URL}${ruta}`, { ...opciones, headers });
  if (respuesta.status === 401) {
    try {
      localStorage.removeItem("usuario");
    } catch {
      // La sesión queda invalidada en el servidor al expirar.
    }
    window.dispatchEvent(new Event("session-expired"));
  }
  return respuesta;
}
