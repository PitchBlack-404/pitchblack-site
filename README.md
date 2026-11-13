# PitchBlack — OTC Crypto Trading (Nigeria)

Manual-settlement OTC desk. Trade requests are placed on the site, the desk confirms on WhatsApp, and transfers happen desk-to-user. This site is not a wallet, does not hold funds, and is not financial advice.

## What is live now

- Landing page with live CoinGecko NGN rates for BTC, USDT, USDC, ETH, BNB, SOL, XRP, DOGE, TRX (fallback table if the API is down)
- Sign up / login UI wired to Supabase (currently in "setup pending" mode — see below)
- User dashboard: live rates, place a buy request (NGN amount, coin, receive address) or a sell request (coin amount, NGN bank account), list of your past requests with status
- Admin panel: when your email is in `ADMIN_EMAILS`, you see every user's trade requests and can mark them pending / completed / declined
- WhatsApp contact: +2349016755312 (https://wa.me/2349016755312), shown site-wide
- Old site kept at `index-v1.html`

## Files

| File | Purpose |
|---|---|
| `index.html` | Shell / landing page |
| `styles.css` | Dark theme, mobile-first |
| `app.js` | SPA: rates, auth, dashboard, admin |
| `config.js` | **Edit me.** Supabase URL + anon key placeholders, admin emails, supported coins, fallback rates |
| `supabase-schema.sql` | Tables `profiles` and `trade_requests` + RLS policies + signup trigger |
| `logo.jpg`, `logo-bw.jpg` | PitchBlack logos |
| `index-v1.html` | Previous version of the site |

## To enable accounts + trades (about 10 minutes)

1. Go to https://supabase.com and create a free project.
2. Supabase dashboard → SQL Editor → New query → paste the contents of `supabase-schema.sql` → Run.
3. Supabase dashboard → Project Settings → API → copy the **Project URL** and **anon public key**.
4. Open `config.js` and replace `SUPABASE_URL` and `SUPABASE_ANON_KEY` with them.
5. In `config.js`, replace `ADMIN_EMAILS` with your own login email.
6. Commit and push to `main`. Render auto-deploys. The auth UI leaves "setup pending" mode automatically.

## Adding / removing a coin

Edit the `COINS` list in `config.js` only. Add an entry with `code`, `name`, `coingeckoId`, minimums and decimals. Rates, the trade form and the dashboard update themselves.

## Notes on the demo RLS

`supabase-schema.sql` ships with two permissive "admin" policies (`using (true)`) so the admin panel works on the free tier without extra JWT plumbing. That means any authenticated user could read all trade requests. Keep the beta private, and tighten RLS later (e.g. a JWT claim or a service-role check) before public launch.
