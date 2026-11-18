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
| **Home** | Spent this month vs the same days last month, income and net flow, money invested (when there is any), a one-line insight, recent transactions grouped by day. On desktop: a spending donut and the pace card. |
| **Report** | Expenses / Income switch. Donut by category or daily bars, daily average, peak day, money invested that month (Expenses view), category cards with share and change vs last month, spending pace, top merchants, 6-month cash flow. |
| **Activity** | Every transaction with search (merchant, amount, account, reference, SMS text), type chips, *Needs review*, a period filter (all time, today, yesterday, a date you pick, or a month) and a category filter. **Add** records a transaction by hand (cash, UPI Lite, a missed SMS): bank entries move *Balance left*, cash entries don't. |
| **Settings** | Bank balance (set, update, remove), this week's and this month's spending with **Manage spending limits** (below), email alerts (coming soon), profile, sync status, currency (when there's more than one), appearance (System / Light / Dark), add to Home Screen, sign out. |

**Balance left** (Settings → Bank balance) is the bank balance you saved there, minus debits and plus credits recorded since you saved it. The backend computes it (`/api/v1/balance`), so it matches what the SMS webhook returns. Credit-card spends count when the card bill is paid. See the backend README.

The **bell** on Home opens the notifications drawer. Spend-limit notifications open the spending limits page, and a pinned row lists SMS that need review. Some notifications carry buttons (for example, to confirm a suggestion): tapping the row's text only marks it read, a button runs its action and the result (such as "Marked as done") replaces the buttons after the next refresh; if the action fails, its reason shows in the row. A notification without a link and without buttons only marks itself read. Each kind has its own icon and colour (`KIND_STYLES` in `components/notification-drawer.tsx`). The red dot means unread notifications. **Clear** (next to ✕) clears them all, and swiping one left deletes it; either way the alert still counts as sent, so it isn't repeated. Tap any transaction for the detail sheet with the original SMS. **Delete** any transaction by swiping its row left (iOS style: a long swipe deletes at once) or with the bin next to Edit in its sheet; **Undo** shows for 5 seconds before the delete reaches the server (leaving the app sends it at once). Spending limits swipe left to delete the same way (`components/swipe-to-delete.tsx`). **Edit** (top left, iOS style) changes its amount, name, category, type or date; a new category is remembered for that merchant, so its next SMS gets it too. **Add a note** (below the details) keeps your own note on any transaction, such as where it was or what it was for: it shows under the row in lists, Activity search finds it, and Edit next to it changes or removes it. On phones, swipe either sheet down by its top bar to close it: a short drag springs back, a longer drag or a quick flick closes it (`components/sheet-drag.ts`). Category cards and donut legends open Activity pre-filtered.

**Spending limits** (`/settings/limits`, from Settings → Manage spending limits) is a page of its own: a back button on top and no tab bar (pages below a tab hide it, `components/app-shell.tsx`). It lists the overall limit, each category's and each merchant's with live meters; **+** adds one (weekly and/or monthly, for all spending, a category or a merchant), **Edit** changes it, and swiping left deletes it. Back goes where you came from, or to Settings when the page was opened directly.

**Merchant limits** (the sheet's *Merchant* switch; **+** opens on it once every category has a limit) cap one merchant, such as Swiggy. Pick a merchant you've paid before, or type one: while you type, the sheet suggests known merchants containing the text (any case, up to 8, most payments first; arrow keys and Enter pick one, Escape closes the list). A typed merchant the server doesn't know yet is saved as a known merchant, spelled as typed, and the sheet asks for its category, which merchant memory then gives its future SMS; a merchant picked from the list keeps its category. Typing a name that already has a limit loads its amounts, and saving updates it; **Edit** changes only the amounts. A limit counts every payment whose merchant name contains its name as the **same whole words with the same upper and lower case**: a "Swiggy" limit counts "Swiggy" and "Swiggy Ltd", but not "SWIGGY" (as an SMS read by the AI may store it), "swiggy" or "Swiggyone". So you can see what's included, each merchant limit lists the names it counts ("Counts: Swiggy, Swiggy Ltd", or "Counts: no payments yet"), on the page and in the sheet before you save. The server does all the matching (`/api/v1/limits/merchants/*`); the app never re-implements it. Merchant limits count toward "N limits set" on Settings.

**Tab bar** (phones): tap a tab or slide along the bar and let go. It navigates on release, for taps and slides alike, because browsers often send no click once a finger has moved; the trailing click, if any, is swallowed. Keyboard, screen-reader and Cmd-clicks go through the links (`components/nav.tsx`).

## Sign-in gate

`proxy.ts` runs before every page. Without a signed-in session cookie (`folio_session` from the backend, with a `user_id`), it redirects to `/login` at the server, so the dashboard is never sent. With one, `/login` redirects to `/`. This only *reads* the cookie, so it can't tell a forged or stale cookie from a real one; the backend still verifies the signature on every API call. If it answers 401, the app goes to `/login?expired=1`, which the proxy never bounces back, so there's no redirect loop. The dashboard routes live in `app/(dashboard)/` with their own layout, so `/login` loads no dashboard code or data.

## Theme

Settings → Appearance offers System, Light and Dark, saved in this browser (`localStorage`, key `folio-theme`). A tiny inline script in `app/layout.tsx` puts `data-theme` on `<html>` before the first paint, so a dark-mode user never sees a light flash; `components/theme.tsx` keeps it in sync with the choice, the OS setting and other tabs. Every colour is a token in `app/globals.css` (`@theme` for light, `:root[data-theme="dark"]` for dark), so components never hard-code colours.

## How numbers are computed

- All transactions are fetched once (200 per request). After that, the app **polls every 5 seconds** while it's visible. Each poll asks only for rows added or changed since the newest change it has (`updated_after`, with a 15 s overlap de-duplicated by id) plus the balance, so edits and categories filled in later by the server show up live, and an idle poll is a few hundred bytes. Hidden tabs and a locked phone don't poll. Coming back after a minute does a full refresh. The "Couldn't refresh" banner appears only after 3 failed polls in a row. Spending limits load at startup alongside everything else (so Settings opens with them filled in) and refresh whenever a new SMS arrives.
- Money is summed in paise (integers). Dates are grouped in India Standard Time.
- SMS the backend couldn't parse (`is_parsed = false`) are listed under *Needs review* and never counted in totals.
- **Only real spending counts.** Two category sets in `lib/categories.ts` decide it (`counts()` and `isInvested()` in `lib/analytics.ts`):
  - `NOT_COUNTED` (**Credit Card Payment**, **Self Transfer**): paying a card bill and moving money between your own accounts are neither spending nor income. The card spends themselves already counted when you swiped the card.
  - `INVESTED` (**Investments & Finance**): money put into investments and deposits (SIPs, mutual funds, FDs, PPF) isn't Spent; Home shows it on its own **Invested** card (only in months that have some) and the Report's Expenses view adds "Invested: ₹… · not in expenses" under its stats. Money coming back from investments counts as nothing, not Income.
  - Everything else counts: debits are Spent, credits are Income. That includes **Cash Withdrawal**, **Transfer** (money to or from other people) and transactions with no category.
  - **Net flow** = Income − Spent − Invested.
  - The sets are copies of `NOT_COUNTED` / `INVESTED` in the backend's `spending.py`, which spending limits use; the backend's `tests/test_spending.py` reads this file and fails if they differ (and if the category list here isn't the backend's, in order). Change both together. These categories still show in Activity (filtering by one shows Spent ₹0), and they can't have a spending limit.
- "vs last month" compares the same days of the previous month while a month is in progress.
- **Salary counts toward the month it pays for.** A credit in **Salary** received on the 16th or later counts toward the next month (the month holding most of the month after payday): salary paid on 31 Oct is November's income, from the 1st. Salary paid on the 15th or earlier (say, late on 2 Nov) counts in its own month. This applies to Income, Net flow, Report, the cash-flow chart and insights; the transaction still shows on its real date in Activity, tagged "Counts in Nov", and Balance left and spending limits are unaffected. Other money in uses **Income** and counts on the day it arrives. If your employer's SMS doesn't say "salary", set it to Salary once with Edit; merchant memory does the rest.
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
