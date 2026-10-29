# Admin portal (Mirat, Phase 2)

Run `npm ci` then `npm run dev` with Node 24. Open `/admin/login`.
The Django backend must be running; create an administrator with
`docker compose exec web python manage.py createsuperuser` from the repository root.

Run `npm run lint`, `npm test`, and `npm run build` before committing.
See [Phase 2 report](../docs/REPORT_Mirat_Phase2.md) for demo steps, scope,
API integration, and validation limitations.

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
