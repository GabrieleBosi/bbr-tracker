# Body By Rings — Tracker

An installable, offline-first PWA to track [Body By Rings](https://www.fitnessfaqs.com/)
calisthenics workouts from your phone during training.

- **Phase / Week / Session** selector for the full 3-phase program.
- Per-exercise cards with target **sets / reps / tempo / rest / intensity cue**.
- Per-set **rep steppers**, optional **load** field, and a **done** toggle.
- **"Last time → try Y"** double-progression suggestions.
- **Rest timer** with vibrate + beep, per-exercise **history**, **deload** banner.
- Data lives in **IndexedDB** (robust, offline). **JSON backup/restore** + **CSV export**.
- Real **PWA**: web manifest + service worker → installs to the home screen, works offline.

## Stack

Vite + vanilla TypeScript · [`idb`](https://github.com/jakearchibald/idb) ·
[`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) (Workbox). No backend.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173/bbr-tracker/
npm run build      # type-check + production build to dist/
npm run preview    # preview the production build
```

The program data lives in [`src/data/program.json`](src/data/program.json) and is the
single source of truth. Icons are generated from [`public/icon.svg`](public/icon.svg)
via `npm run icons` (regenerate and commit the PNGs after editing the SVG).

## Deploy to GitHub Pages

Served as a **project page** at `https://<user>.github.io/bbr-tracker/`, which is why
`base` is `/bbr-tracker/` in [`vite.config.ts`](vite.config.ts). Pushing to `main`
runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds and
publishes `dist/`. See the project setup notes for the exact terminal commands.
