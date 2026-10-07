# Folio

## Public repository setup

Each person runs their own local workspace. Start with `start.cmd` using Node.js 24 or later. The app creates a new local database automatically; no database from another user is needed.

Demo mode needs no credentials. For live data, add your own Finnhub key in Settings, or copy `.env.example` to `.env` and enter your own key locally. Never commit `.env`, the `data/` directory, database backups, or API keys.

Security notice: an earlier revision included a local database containing a saved API key. Removing it from the latest revision does not remove it from Git history. The exposed key must be revoked and replaced; history cleanup is a separate operation.

A free, local US-stock portfolio and company-news template. Demo mode is the default: all prices are illustrative and all sample stories are fictional.

## Run

Requires Node.js 24 or later (already available on this computer). No packages to install.

Double-click **start.cmd**, keep its terminal open, then open **http://localhost:4317**.

Alternatively, open a terminal in this folder and run `npm start`.

Stop the server with Ctrl+C. Port in use? Copy `.env.example` to `.env`, change `PORT`, and use that port in the browser. The server binds to the local computer only.

## Use

- Start with the seeded five-stock example, or select **Portfolio → New portfolio** to start empty.
- Add stocks with **Add stock** or the search box. The `/` keyboard shortcut opens search.
- Enter shares and optionally your average purchase price. Fractional shares are supported.
- **Edit** replaces a holding's total shares and average cost; it does not record a trade.
- Click a ticker for price details and a shortcut to its news.
- **Newsroom** combines news for the selected portfolio. Each stock has its own tab.
- **Most important** prioritizes event keywords and recency; **Latest first** sorts by time.
- Holdings persist in `data/folio.sqlite`. Keep this folder when updating the app.

## Optional free live data

1. Register for a free key at https://finnhub.io/register. Folio does not subscribe to or purchase any plan.
2. In **Settings**, paste the key locally, choose **Connect Finnhub**, and save.
3. Review any availability or key errors. Return to demo mode at any time.

Alternatively, copy `.env.example` to `.env` and set `FINNHUB_API_KEY`, restart, then choose live mode in Settings. A saved settings key takes precedence. Removing the saved key does not remove an environment key.

The key is kept on the local server, in the SQLite settings table (unencrypted) or `.env`. It is never returned by the app API or placed in a browser URL. Do not share the data folder or your `.env` file. The `.gitignore` excludes both.

Official Finnhub endpoints used:

- `GET https://finnhub.io/api/v1/stock/symbol?exchange=US` — filter to USD common stocks and ADRs.
- `GET https://finnhub.io/api/v1/quote?symbol=AAPL` — latest available quote.
- `GET https://finnhub.io/api/v1/company-news?symbol=AAPL&from=YYYY-MM-DD&to=YYYY-MM-DD` — company news over the last seven days.
- Authentication uses the `X-Finnhub-Token` header.

References: https://finnhub.io/docs/api/quote and https://finnhub.io/docs/api/company-news.

Live access has not been tested with a personal API key. Availability, exchange coverage, delay, and limits depend on Finnhub's current free plan. Errors never trigger a paid subscription or substitute sample values into live results.

## Data behavior

Quotes are cached for 60 seconds, news for five minutes, and the US symbol catalog for 24 hours. Live mode refreshes once a minute while the page is visible; the cache prevents unnecessary news requests. The app limits provider requests to 45 per minute, supports 30 holdings per portfolio, and shows partial/error states when limits prevent full coverage. A large portfolio's first refresh can require more than one cycle. Stale cached quotes are labelled and warnings explain news refresh failures.

Portfolio value is latest quote × shares. Day change compares with the previous close. Total return is unrealized price return for holdings with a known cost, excluding dividends, fees, taxes, and currency conversion. Missing quotes make totals partial; holdings with unknown cost are excluded from the return calculation.

Live articles must contain a matching provider `related` ticker. Duplicate URLs (ignoring common tracking fields) and identical normalized headlines are merged. Importance is a transparent heuristic: company match + event keywords + recency. It is not a prediction or investment recommendation. Provider tagging and keyword ranking can be imperfect. Live articles open at the original publisher; Folio does not bypass paywalls.

## Extend

- `public/app.js`: UI, forms, navigation, and portfolio calculations.
- `public/style.css`: responsive layout and styling.
- `server.mjs`: loopback-only server, validation, SQLite persistence, and API routes.
- `market.mjs`: sample catalog, fictional news, Finnhub integration, filtering and ranking.

No build step or third-party dependencies. Use `node --check` on each JavaScript file after changes. Optional WebMCP tools are feature-detected; browsers without the proposed API work normally. WebMCP support has not been verified in a supporting browser.
