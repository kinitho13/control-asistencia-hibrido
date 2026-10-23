# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## API URL

The frontend reads the backend base URL from `VITE_API_URL`. Copy `.env.example`
to `.env.local` for local development and set the URL there. In production,
configure `VITE_API_URL` in the hosting provider's build environment, for example:

```text
VITE_API_URL=https://your-backend.example.com
```

Vite embeds this value during the build, so rebuild and redeploy the frontend
after changing it. Do not include a trailing slash.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
