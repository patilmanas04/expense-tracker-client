# Veyra · Next.js expense dashboard

A responsive personal dashboard using Next.js App Router, TypeScript, Recharts and Lucide. On iPhone, navigation moves to the bottom, transaction rows condense and charts/cards stack vertically.

## Visual identity

**Veyra** is a coined brand inspired by value and a new era of understanding your money. Its original vector mark uses two directional ribbons to form a V, with a mint diamond representing value in motion. The reusable logo lives at `public/veyra-logo.svg`, with a matching favicon in `app/icon.svg` and an inline component in `components/brand.tsx`.

The interface adapts the supplied mobile reference: a violet gradient spending header, translucent metrics, a rounded content sheet, softly filled trend charts, color-coded category bars and a floating refresh control. Category percentages represent share of actual spending, not invented budgets. Category cards open filtered transactions. Income and net cash flow remain visible in the mobile summary. The same styling extends to sign-in and desktop layouts.

## Run

```powershell
npm install
npm run dev
```

Open http://localhost:3000 with FastAPI running on port 8000. Optional `.env.local`: `BACKEND_URL=http://127.0.0.1:8000`. Next.js proxies `/api/v1/*` to FastAPI. Rebuild/restart when changing this target.

Google credentials, callback URLs and iPhone automation instructions are in the backend README (`../expense-tracker-server/README.md`). Google client secrets and webhook secrets never belong in frontend variables.

## Included

- Google sign-in with setup, error and retry states.
- Income, expenses, net cash flow, daily average, cash-flow and category charts.
- Currency/date selection, search, category/type filters, pagination, transaction details and current-page CSV export.
- Empty/loading/error states, mobile safe areas, keyboard controls, modal focus management and reduced motion.

Charts/totals reflect the period and currency. Table filters only affect the table. Dates use India Standard Time. Unparsed records are flagged and excluded from totals. Production has no demo data. Google Fonts have system font fallbacks.

## Checks

```powershell
npm run typecheck
npm run build
npx playwright test
```

Browser tests use isolated mock responses and screenshots of fixtures, not real financial data. Tests use installed Microsoft Edge on Windows and Chromium elsewhere; run `npx playwright install chromium` on Linux/macOS first.

Tests use port 3100 to avoid reusing the live development server on port 3000. Build before running browser tests.

If the system npm shim is broken on Windows, use:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run dev
```

The dev server binds to 0.0.0.0 for LAN preview, subject to your firewall. iPhone Google sign-in needs a stable HTTPS frontend domain with the matching OAuth callback configured; see the backend README.
