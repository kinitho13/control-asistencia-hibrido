# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## API URL

The frontend reads the backend base URL from `VITE_API_URL`. If it is not set,
the frontend detects its hostname: `localhost` uses `http://localhost:8000`, and
opening the frontend through a LAN address uses that same address on port 8000.
Copy `.env.example` to `.env.local` and leave `VITE_API_URL` empty for this
automatic behavior. In production, configure `VITE_API_URL` in the hosting
provider's build environment, for example:

```text
VITE_API_URL=https://your-backend.example.com
```

Vite embeds this value during the build, so rebuild and redeploy the frontend
after changing it. Do not include a trailing slash.

To share the development frontend on the local network, run the backend with
`uvicorn main:app --host 0.0.0.0 --port 8000` from the `backend` folder and start
Vite with `npm run dev -- --host 0.0.0.0`. Other devices should open the
frontend using the host computer's LAN IP, such as `http://172.16.30.71:5173`.
Ensure the host firewall permits inbound connections on ports 5173 and 8000.

For Windows startup, backup, and safe restore-check commands, see the
[operation guide](../OPERACION.md).

## Marca e iconos

El logo se comparte entre el inicio de sesión y la barra lateral desde
`src/assets/logo-control-asistencia.png`. Los iconos del menú, el acceso y las
tarjetas de resumen usan el sprite SVG local `src/assets/ui-icons.svg`, por lo
que no dependen de enlaces de iconos externos ni de emojis del dispositivo.

La tipografia Catamaran se carga localmente con Fontsource y se usa en las
pantallas, formularios, navegacion y graficos, incluso cuando la aplicacion no
tiene acceso a Internet.

## Performance

Application sections are loaded when opened, so the initial download does not
need to include every calendar, chart, and administration screen. Excel
generation is also loaded only when an export is requested.

## Calendar and schedule views

Calendar and schedule views show Cristian, Rene, Juan, Fabian, and Diego by
default (name matching ignores accents and capitalization). Use **Personalizar**
to choose individual people or **Ver todos** to show every user. The selection
is saved in the browser and shared between both views. Excel exports the current
filtered view; PDF opens the browser print dialog, where you can choose **Save as
PDF**.

## Solicitudes, avisos y reportes

- **Solicitudes** lets a signed-in user ask for a modality change, report an
  absence, or request a registered substitute. An administrator or leader can
  approve or reject pending requests; approval applies the change to attendance
  or creates the replacement.
- **Notificaciones** shows in-app notices for requests, decisions, schedule
  changes, and calendar closures. The navigation badge refreshes every 30
  seconds. Email delivery is not configured.
- **Reportes** filters attendance by date range and person, summarizes home and
  office days, and exports the filtered rows to Excel or the print dialog.
- **Historial** shows recent administrative changes, including who performed
  them when the action came from a signed-in session.
- **Cierres** lets administrators define office-closure date ranges. Attendance
  validation, replacement requests, and the schedule generator respect those
  ranges; existing attendance is retained and is not deleted automatically.
- **Liderazgo** adds today's attendance and pending-request counts to the
  dashboard for administrators and leaders.
- **Mi asistencia** records each person's real arrival and departure separately
  from the planned schedule. Administrators and leaders can use its team
  roll-call view to register or correct attendance; timestamps use
  `America/Bogota`.

These features use an eight-hour backend session returned by login. Existing
browser sessions without a session token must sign in again. New tables are
created from the SQLAlchemy models when the backend starts.

The backend also checks roles on write operations: only administrators can
manage users, restrictions, holidays, and closures; administrators and leaders
can manage attendance, replacements, and schedule generation. For production,
set `APP_ENV=production` and provide `CORS_ALLOWED_ORIGINS` on the backend.
See the [operation guide](../OPERACION.md) for the one-time administrator
bootstrap and deployment requirements.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
