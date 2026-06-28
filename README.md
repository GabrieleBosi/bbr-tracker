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
- Per-exercise **progress chart** (total reps per week + top-set marker), drawn as inline SVG.
- Optional **cross-device sync** via a private GitHub Gist (token stays on-device).

## Cross-device sync

Local-first and additive — the app is fully usable without it. In **Data → Sync**,
paste a GitHub token with the **`gist`** scope and tap **Sync now**. The app pulls the
gist, merges it with local data (union; on conflict the more-logged entry wins), writes
the merged result back, and pushes it up. The first sync creates a private gist and
remembers its id. The token is stored only in this browser's `localStorage` — it is
never committed to the repo or included in the JSON backup. Because GitHub Pages is
served from a **public** repo (free tier), never hard-code a token in the source.

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
