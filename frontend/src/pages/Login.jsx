import { useState } from "react";
import { API_URL } from "../config";

function Login({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const ingresar = async (e) => {
    e.preventDefault();
    if (cargando) return;

    const usuarioLimpio = usuario.trim();

    if (!usuarioLimpio || !password) {
      setError("Ingresa tu usuario y contraseña.");
      return;
    }

    setCargando(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/login?usuario=${encodeURIComponent(usuarioLimpio)}&password=${encodeURIComponent(password)}`,
        { method: "POST" }
      );

      let data = null;
      try {
        data = await response.json();
      } catch {
        /* respuesta sin JSON */
      }

      if (!response.ok || !data || data.detail) {
        const detalle = data?.detail;
        setError(
          typeof detalle === "string"
            ? detalle
            : "No se pudo iniciar sesión. Verifica tus datos."
        );
        return;
      }

      onLogin(data);
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="login">
      <style>{estilos}</style>

      <form className="login__tarjeta" onSubmit={ingresar} noValidate>
        <div className="login__logo" aria-hidden="true">GT</div>
        <h1 className="login__titulo">Control de Asistencia</h1>
        <p className="login__subtitulo">Inicia sesión para continuar</p>

        {error && (
          <div className="login__error" role="alert">
            <span aria-hidden="true">⚠️</span> {error}
          </div>
        )}

        <label className="login__campo">
          <span className="login__etiqueta">Usuario</span>
          <input
            className="login__input"
            type="text"
            placeholder="Tu usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            autoFocus
            disabled={cargando}
          />
        </label>

        <label className="login__campo">
          <span className="login__etiqueta">Contraseña</span>
          <div className="login__password">
            <input
              className="login__input"
              type={verPassword ? "text" : "password"}
              placeholder="Tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={cargando}
            />
            <button
              type="button"
              className="login__ojo"
              onClick={() => setVerPassword((v) => !v)}
              aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              title={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {verPassword ? "🙈" : "👁️"}
            </button>
          </div>
        </label>

        <button className="login__boton" type="submit" disabled={cargando}>
          {cargando ? (
            <>
              <span className="login__spinner" aria-hidden="true" /> Ingresando...
            </>
          ) : (
            "Ingresar"
          )}
        </button>
      </form>
    </div>
  );
}

const estilos = `
body { margin: 0; display: block; background: #f8fafc; }
#root { max-width: none; margin: 0; padding: 0; text-align: left; }

.login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  box-sizing: border-box;
  background: linear-gradient(135deg, #edf2ff 0%, #f8fafc 60%);
  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
}

.login__tarjeta {
  width: 100%;
  max-width: 400px;
  padding: 36px 32px;
  box-sizing: border-box;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  animation: login-entrada 0.4s cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}

.login__logo {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  margin: 0 auto 16px;
  border-radius: 14px;
  background: linear-gradient(135deg, #3b5bdb, #5c7cfa);
  box-shadow: 0 6px 14px rgba(59, 91, 219, 0.3);
  font-weight: 700;
  color: #ffffff;
}

.login__titulo {
  margin: 0;
  text-align: center;
  font-size: 1.4rem;
  letter-spacing: -0.01em;
  color: #1e293b;
}

.login__subtitulo {
  margin: 6px 0 24px;
  text-align: center;
  font-size: 0.9rem;
  color: #64748b;
}

.login__error {
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fef2f2;
  font-size: 0.85rem;
  color: #b91c1c;
}

.login__campo { display: block; margin-bottom: 16px; }

.login__etiqueta {
  display: block;
  margin-bottom: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
}

.login__input {
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
.login__input::placeholder { color: #94a3b8; }
.login__input:focus {
  outline: none;
  border-color: #3b5bdb;
  box-shadow: 0 0 0 3px rgba(59, 91, 219, 0.15);
}
.login__input:disabled { background: #f1f5f9; cursor: not-allowed; }

.login__password { position: relative; }
.login__password .login__input { padding-right: 44px; }

.login__ojo {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 1rem;
  cursor: pointer;
}
.login__ojo:hover { background: #f1f5f9; }
.login__ojo:focus-visible { outline: 2px solid #3b5bdb; }

.login__boton {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 44px;
  margin-top: 8px;
  border: none;
  border-radius: 10px;
  background: #3b5bdb;
  font-size: 0.95rem;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: background-color 0.15s, transform 0.15s;
}
.login__boton:hover:not(:disabled) { background: #364fc7; }
.login__boton:active:not(:disabled) { transform: scale(0.98); }
.login__boton:focus-visible { outline: 2px solid #3b5bdb; outline-offset: 2px; }
.login__boton:disabled { opacity: 0.7; cursor: not-allowed; }

.login__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: login-giro 0.7s linear infinite;
}

@keyframes login-entrada {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}
@keyframes login-giro { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .login__tarjeta, .login__spinner { animation: none; }
  .login__input, .login__boton { transition: none; }
}
`;

export default Login;