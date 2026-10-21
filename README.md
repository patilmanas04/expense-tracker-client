# Folio · expense dashboard

Next.js 16 frontend for the FastAPI SMS expense tracker in `../expense-tracker-server`. Built mobile-first for iPhone, with a sidebar layout on desktop.

## Run

```bash
npm install
cp .env.example .env.local   # optional, defaults to http://127.0.0.1:8000
npm run dev                  # http://localhost:3000
```

Start the backend first (`uv run uvicorn main:app --port 8000` in the server folder). Next.js proxies `/api/v1/*` to `BACKEND_URL`, so the browser only talks to this origin and the backend's session cookie stays first-party. Google sign-in, the webhook and the iPhone Shortcut are configured in the backend README.

**Production:** rewrites are resolved at build time, so set `BACKEND_URL` **before** `npm run build`, then `npm start`. For iPhone access use a stable HTTPS domain and point the backend's `FRONTEND_URL` / `GOOGLE_REDIRECT_URI` at it. Previewing `next dev` from a phone over your LAN needs that address in `allowedDevOrigins` in `next.config.ts`, and Google sign-in won't work on a bare LAN IP.

## Screens

| Screen | What it shows |
| --- | --- |
| **Home** | Spent this month vs the same days last month, income and net flow, a one-line insight, recent transactions grouped by day. On desktop: a spending donut and the pace card. |
| **Report** | Expenses / Income switch. Donut by category or daily bars, daily average, peak day, category cards with share and change vs last month, spending pace, top merchants, 6-month cash flow. |
| **Activity** | Every transaction with search (merchant, amount, account, reference, SMS text), type chips, *Needs review*, period and category filters. **Add** records a transaction by hand (cash, UPI Lite, a missed SMS): bank entries move *Balance left*, cash entries don't. Entries you added can be deleted from their detail sheet; bank SMS can't. |
| **Settings** | Bank balance (set, update, remove), spending limits (weekly/monthly with live meters), profile, sync status, currency (when there's more than one), appearance (System / Light / Dark), add to Home Screen, sign out. |

**Balance left** (Home header, under *Spent this month*) is your bank balance from Settings, minus debits and plus credits recorded since you saved it. The backend computes it (`/api/v1/balance`), so it matches what the SMS webhook returns. Credit-card spends count when the card bill is paid. See the backend README.

The **bell** on Home opens the notifications drawer. Spend-limit notifications link to Settings → Spending limits, and a pinned row lists SMS that need review. The red dot means unread notifications. Tap any transaction for the detail sheet with the original SMS. On phones, swipe either sheet down by its top bar to close it: a short drag springs back, a longer drag or a quick flick closes it (`components/sheet-drag.ts`). Category cards and donut legends open Activity pre-filtered.

## Sign-in gate

`proxy.ts` runs before every page. Without a signed-in session cookie (`folio_session` from the backend, with a `user_id`), it redirects to `/login` at the server, so the dashboard is never sent. With one, `/login` redirects to `/`. This only *reads* the cookie, so it can't tell a forged or stale cookie from a real one; the backend still verifies the signature on every API call. If it answers 401, the app goes to `/login?expired=1`, which the proxy never bounces back, so there's no redirect loop. The dashboard routes live in `app/(dashboard)/` with their own layout, so `/login` loads no dashboard code or data.

## Theme

Settings → Appearance offers System, Light and Dark, saved in this browser (`localStorage`, key `folio-theme`). A tiny inline script in `app/layout.tsx` puts `data-theme` on `<html>` before the first paint, so a dark-mode user never sees a light flash; `components/theme.tsx` keeps it in sync with the choice, the OS setting and other tabs. Every colour is a token in `app/globals.css` (`@theme` for light, `:root[data-theme="dark"]` for dark), so components never hard-code colours.

## How numbers are computed

- All transactions are fetched once (200 per request). After that, the app **polls every 5 seconds** while it's visible. Each poll asks only for rows recorded since the newest one it has (`created_after`, with a 15 s overlap de-duplicated by id) plus the balance, so an idle poll is a few hundred bytes. Hidden tabs and a locked phone don't poll. Coming back after a minute does a full refresh. The "Couldn't refresh" banner appears only after 3 failed polls in a row. Spending limits load at startup alongside everything else (so Settings opens with them filled in) and refresh whenever a new SMS arrives.
- Money is summed in paise (integers). Dates are grouped in India Standard Time.
- SMS the backend couldn't parse (`is_parsed = false`) are listed under *Needs review* and never counted in totals.
- "vs last month" compares the same days of the previous month while a month is in progress.
- Each category has a fixed colour (`lib/categories.ts`), so it doesn't change colour from month to month. The palette was checked for colour-blind separation.

## Code map

- `app/`: routes, metadata, PWA manifest, icons
- `components/data-provider.tsx`: session, data loading, shared month/currency state
- `components/views/*`: one file per screen
- `components/charts/*`: hand-drawn SVG donut and Recharts bar charts (each with a table view)
- `lib/analytics.ts`: all aggregations (pure functions)
- `lib/format.ts`: IST dates and `en-IN` currency formatting

## Checks

```bash
npx tsc --noEmit
npm run lint
npm run build
```
