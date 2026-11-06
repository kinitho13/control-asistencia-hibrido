import { useState } from "react";
import { API_URL } from "../config";
import Icono from "../components/Icono";
import logoControlAsistencia from "../assets/logo-control-asistencia.png";

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
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: usuarioLimpio, password }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        /* respuesta sin JSON */
      }

      if (!response.ok || !data || data.detail) {
        const detalle = data?.detail;
        setError(
          response.status === 401
            ? "Usuario o contraseña incorrectos. Revisa los datos e inténtalo de nuevo."
            : typeof detalle === "string"
              ? detalle
              : "No se pudo iniciar sesión. Inténtalo de nuevo."
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
      <div className="login__fondo" aria-hidden="true">
        <span className="login__circulo login__circulo--uno" />
        <span className="login__circulo login__circulo--dos" />
        <span className="login__circulo login__circulo--tres" />
      </div>

      <form className="login__tarjeta" onSubmit={ingresar} noValidate>
        <img className="login__logo" src={logoControlAsistencia} alt="Logo de Control de Asistencia" />
        <p className="login__marca">GESTIÓN DE EQUIPO</p>
        <h1 className="login__titulo">Control de Asistencia</h1>
        <p className="login__subtitulo">Inicia sesión para continuar</p>

        {error && (
          <div className="login__error" role="alert">
            <Icono nombre="alerta" className="login__error-icono" /> {error}
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
              <Icono nombre={verPassword ? "ojo-cerrado" : "ojo"} className="login__ojo-icono" />
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
:root {
  --login-bg-primary: #050816;
  --login-bg-secondary: #0f172a;
  --login-glass: rgba(255, 255, 255, 0.075);
  --login-glass-border: rgba(255, 255, 255, 0.16);
  --login-text: #ffffff;
  --login-text-secondary: #b8c1d9;
  --login-input-bg: rgba(255, 255, 255, 0.09);
  --login-button: #64748b;
  --login-button-hover: #94a3b8;
}

.login {
  position: fixed;
  inset: 0;
  isolation: isolate;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: 28px 20px;
  box-sizing: border-box;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(51, 65, 85, 0.38), transparent 48%),
    linear-gradient(135deg, #030712 0%, var(--login-bg-primary) 48%, #111827 100%);
  font-family: var(--sans);
}

.login__fondo { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }

.login__circulo {
  position: absolute;
  display: block;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  filter: blur(1px);
  animation: login-flotar 12s ease-in-out infinite alternate;
}

.login__circulo--uno {
  top: 12%;
  left: 12%;
  width: 150px;
  aspect-ratio: 1;
  background: radial-gradient(circle at 35% 30%, rgba(203, 213, 225, 0.2), rgba(100, 116, 139, 0.025) 72%);
  box-shadow: 0 0 80px rgba(148, 163, 184, 0.12);
}

.login__circulo--dos {
  right: 12%;
  bottom: 10%;
  width: 230px;
  aspect-ratio: 1;
  background: radial-gradient(circle at 35% 30%, rgba(96, 165, 250, 0.2), rgba(59, 130, 246, 0.025) 72%);
  animation-delay: -4s;
}

.login__circulo--tres {
  top: 18%;
  right: 21%;
  width: 82px;
  aspect-ratio: 1;
  background: rgba(255, 255, 255, 0.055);
  animation-delay: -7s;
}

.login__tarjeta {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  padding: 42px 38px 38px;
  box-sizing: border-box;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.095), rgba(255, 255, 255, 0.045));
  border: 1px solid var(--login-glass-border);
  border-radius: 24px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45), inset 0 1px rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  animation: login-entrada 0.55s cubic-bezier(0.2, 0.7, 0.3, 1) both;
}

.login__logo {
  display: block;
  width: 86px;
  height: 86px;
  margin: 0 auto 14px;
  object-fit: contain;
  filter: brightness(0) invert(1) drop-shadow(0 10px 22px rgba(139, 92, 246, 0.38));
}

.login__marca {
  margin: 0 0 8px;
  text-align: center;
  color: #cbd5e1;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.2em;
}

.login__titulo {
  margin: 0;
  text-align: center;
  font-size: clamp(1.45rem, 5vw, 1.75rem);
  letter-spacing: -0.035em;
  color: var(--login-text);
}

.login__subtitulo {
  margin: 9px 0 30px;
  text-align: center;
  font-size: 0.9rem;
  color: var(--login-text-secondary);
}

.login__error {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-bottom: 18px;
  padding: 12px 14px;
  border: 1px solid rgba(252, 165, 165, 0.32);
  border-radius: 12px;
  background: rgba(127, 29, 29, 0.3);
  font-size: 0.85rem;
  line-height: 1.5;
  color: #fecaca;
}
.login__error-icono { flex: 0 0 auto; width: 18px; height: 18px; }

.login__campo { display: block; margin-bottom: 19px; }

.login__etiqueta {
  display: block;
  margin-bottom: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #e2e8f0;
}

.login__input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  background: var(--login-input-bg);
  font-size: 0.95rem;
  color: var(--login-text);
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
}
.login__input::placeholder { color: #94a3b8; }
.login__input:focus {
  outline: none;
  border-color: rgba(203, 213, 225, 0.62);
  background: rgba(255, 255, 255, 0.13);
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.16);
}
.login__input:disabled { opacity: 0.65; cursor: not-allowed; }

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
  filter: grayscale(1);
}
.login__ojo-icono { display: block; width: 20px; height: 20px; }
.login__ojo:hover { background: rgba(255, 255, 255, 0.1); }
.login__ojo:focus-visible { outline: 2px solid #cbd5e1; }

.login__boton {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  margin-top: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  background: linear-gradient(135deg, var(--login-button), var(--login-button-hover));
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(100, 116, 139, 0.22), inset 0 1px rgba(255, 255, 255, 0.25);
  transition: box-shadow 0.2s, transform 0.2s, filter 0.2s;
}
.login__boton:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(148, 163, 184, 0.28); filter: brightness(1.08); }
.login__boton:active:not(:disabled) { transform: translateY(0) scale(0.99); }
.login__boton:focus-visible { outline: 2px solid #e2e8f0; outline-offset: 3px; }
.login__boton:disabled { opacity: 0.65; cursor: not-allowed; }

.login__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: login-giro 0.7s linear infinite;
}

@keyframes login-entrada {
  from { opacity: 0; transform: translateY(18px) scale(0.985); }
  to { opacity: 1; transform: none; }
}
@keyframes login-giro { to { transform: rotate(360deg); } }
@keyframes login-flotar {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(14px, -18px, 0); }
}

@media (max-width: 480px) {
  .login { padding: 18px 14px; }
  .login__tarjeta { padding: 34px 24px 28px; border-radius: 20px; }
  .login__circulo--uno { left: -48px; top: 8%; width: 130px; }
  .login__circulo--dos { right: -90px; bottom: 7%; width: 190px; }
  .login__circulo--tres { right: 9%; }
}

@media (prefers-reduced-motion: reduce) {
  .login__tarjeta, .login__spinner, .login__circulo { animation: none; }
  .login__input, .login__boton { transition: none; }
}
`;

export default Login;