# Anima application

Standard Next.js App Router starter using TypeScript, React, Tailwind CSS and ESLint. Product scope is in [state.md](state.md).

## Run locally

Use Node.js 20.9 or newer (an active LTS release is recommended) and npm.

```bash
npm ci
npm run dev
```

Open http://localhost:3000. Edit `src/app/page.tsx` to start building the app.

## Checks and production

```bash
npm run lint
npm run typecheck
npm run build
npm start
```

The standard template downloads Geist fonts from Google during the production build, so the build needs network access. Dependencies are pinned through `package-lock.json`.

## Structure

- `src/app/page.tsx`: standard starter homepage.
- `src/app/layout.tsx`: root layout, fonts and metadata.
- `src/app/globals.css`: Tailwind import and shared styles.
- `public/`: standard starter assets.
- `next.config.ts`: framework configuration.
- `state.md`: agreed clinical app scope and implementation status.

Keep future simulator credentials in `.env.local`, which is ignored by Git. Use server-side environment variables for secrets, never `NEXT_PUBLIC_` variables. The scaffold does not yet access the simulator or contain patient records.

Downloaded simulator reference documents remain local and excluded from the commit. The existing local `README.md` describes those downloads; this file documents the application.
