# catofa

A web interface for the Lakeside Cashu faucet workflow. Catofa wraps the `lakeside` CLI and exposes a guided UI for:

1. Initializing and importing ticket data (paste or CSV upload)
2. Funding & inspecting the persistent wallet
3. Launching/stopping `lakeside faucet serve` with preset options
4. Testing attendee claims via the `/claim` endpoint (operator mode)
5. **GetYourToken** – a user-facing page where attendees enter their ticket code and copy their Cashu tokens

## Stack

- **Frontend:** React + Vite + TypeScript
- **Backend:** Express (TypeScript, served via `tsx`) that shells out to `lakeside`
- **Runtime data:** stored under `catofa/runtime/` by default (tickets JSON, temp uploads, etc.)

## Prerequisites

- Node.js 20+
- `lakeside` binary available on `$PATH` (or set `LAKESIDE_BIN`) and access to the Lakeside repo/build (`LAKESIDE_CWD` defaults to `../lakeside`).

## Development

```bash
cd catofa
npm install
npm run dev:full   # starts both the Express API and Vite dev server
```

API listens on `http://localhost:4077`, Vite dev UI on `http://localhost:5173` (the Vite dev server proxies `/api/*` calls to the Express backend).

## Production build

```bash
npm run build      # tsc + vite build (outputs to dist/)
NODE_ENV=production npm run start
```

When `NODE_ENV=production`, the Express server serves the static files from `dist/` and exposes the `/api` routes on the same port (default `4077`).

## Configuration

The backend honors optional env vars:

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | Express listener port | `4077` |
| `CATOFA_DATA_DIR` | Directory for runtime artifacts | `catofa/runtime` |
| `CATOFA_TICKETS` | Path to the tickets JSON store | `${DATA_DIR}/tickets.json` |
| `CATOFA_FAUCET_URL` | Default faucet base URL for the claim tester | `http://127.0.0.1:8080` |
| `LAKESIDE_BIN` | Command to execute for Lakeside | `lakeside` |
| `LAKESIDE_ARGS` | Extra args prefixed to every Lakeside call | *(empty)* |
| `LAKESIDE_CWD` | Working directory for the Lakeside CLI | `../lakeside` |

## UI Walkthrough

1. **Tickets:** initialize the datastore, paste/import CSVs (or upload the export file directly), and view a live table of attendees (status + claims).
2. **Wallet:** fund with sats (live log shows the BOLT11 invoice + status), toggle Bolt12, and poll `lakeside wallet balance`.
3. **Faucet:** configure mint/bind/payout mode, start or stop the faucet process, and inspect live logs.
4. **Claim tester (operator view):** run sample `/claim` requests from the browser against any faucet URL.
5. **GetYourToken (attendee view):** a lightweight page with a single ticket-code field. It reuses `/api/claim`, displays total sats + bundle count, and shows copy-to-clipboard buttons per token so guests can paste them into their Cashu wallet.

---

Licensed under MIT (matching Lakeside).
