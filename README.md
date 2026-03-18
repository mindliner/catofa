# catofa

A web interface for the Lakeside Cashu faucet workflow. Catofa wraps the `lakeside` CLI and exposes a guided UI for:

1. Initializing and importing ticket data (paste or CSV upload)
2. Funding & inspecting the persistent wallet
3. Launching/stopping `lakeside faucet serve` with preset options
4. Testing attendee claims via the `/claim` endpoint (operator mode)
5. **Attendee portal (`/attendee`)** – a standalone page where guests enter their ticket code and copy their Cashu tokens without seeing the control room

The name stands for **ca**-shu **to**-ken **fa**-ucet.

## Stack

- **Frontend:** React + Vite + TypeScript
- **Backend:** Express (TypeScript, served via `tsx`) that shells out to `lakeside`
- **Runtime data:** stored under `catofa/runtime/` by default (tickets JSON, temp uploads, etc.)

## Prerequisites

- Node.js 20+
- Rust toolchain / Cargo (Catofa falls back to `cargo run --quiet --` if it can't find a pre-built `lakeside` binary).
- `lakeside` binary available on `$PATH` (or set `LAKESIDE_BIN`) and access to the Lakeside repo/build (auto-detected when Catofa lives inside `lakeside/ui/catofa`).

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

## Docker / Compose deployment

Catofa now ships with a multi-stage container image that bundles the Lakeside CLI. The Docker build expects the `lakeside` repo to live beside Catofa (e.g. `/path/to/workspace/{catofa,lakeside}`); adjust the build args if your layout differs.

1. Copy the sample env file and tweak as needed:
   ```bash
   cp .env.example .env
   # edit CATOFA_PORT, CATOFA_FAUCET_URL, etc.
   ```
2. Build and start the stack from inside the Catofa repo (Compose points its build context one directory up so it can see both `catofa/` and `lakeside/`):
   ```bash
   docker compose up --build -d
   ```
3. The API/UI listens on `http://localhost:${CATOFA_PORT}` (default `4077`). Runtime artifacts live in the `catofa_runtime` volume and the persistent wallet is stored in `catofa_wallet`.

Use `docker compose logs -f catofa` to follow the Express + Lakeside output.

### Compose configuration reference

| Setting | Default | Purpose |
| --- | --- | --- |
| `CATOFA_PORT` | `4077` | Host port that proxies to the Express server. |
| `CATOFA_DATA_DIR` | `/var/lib/catofa` | Where tickets, CSV uploads, and faucet metadata are stored inside the container. |
| `CATOFA_TICKETS` | `${CATOFA_DATA_DIR}/tickets.json` | Override if you want to point at an existing datastore. |
| `CATOFA_FAUCET_URL` | `http://127.0.0.1:8080` | Default faucet endpoint for the claim tester. |
| `CATOFA_WALLET` | `/home/node/.lakeside` | Wallet directory; mapped to the `catofa_wallet` volume. |
| `LAKESIDE_BIN` | `/usr/local/bin/lakeside` | Pre-baked binary inside the image. |
| `LAKESIDE_CWD` | `/opt/lakeside` | Working directory for CLI invocations. |

Both named volumes defined in `docker-compose.yml` are optional; you can swap them for host bind mounts if you want the files on the local filesystem instead of Docker-managed volumes.

## Configuration

The backend honors optional env vars:

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | Express listener port | `4077` |
| `CATOFA_DATA_DIR` | Directory for runtime artifacts | `catofa/runtime` |
| `CATOFA_TICKETS` | Path to the tickets JSON store | `${DATA_DIR}/tickets.json` |
| `CATOFA_FAUCET_URL` | Default faucet base URL for the claim tester | `http://127.0.0.1:8080` |
| `CATOFA_CONTROL_ROOM_KEY` | Shared secret required for the operator control room + all `/api/*` routes (attendee portal remains public) | *(empty)* |
| `LAKESIDE_BIN` | Command to execute for Lakeside | auto detects `target/release|debug/lakeside`; falls back to `cargo` if missing |
| `LAKESIDE_ARGS` | Extra args prefixed to every Lakeside call | *(empty)* |
| `LAKESIDE_CWD` | Working directory for the Lakeside CLI | auto-detected by walking up to the repo root |

## UI Walkthrough

1. **Tickets:** initialize the datastore, paste/import CSVs (or upload the export file directly), and view a live table of attendees (status + claims).
2. **Wallet:** fund with sats (live log shows the BOLT11 invoice + status), toggle Bolt12, and poll `lakeside wallet balance`.
3. **Faucet:** configure mint/bind/payout mode, start or stop the faucet process, and inspect live logs.
4. **Claim tester (operator view):** run sample `/claim` requests from the browser against any faucet URL.
5. **Attendee portal (`/attendee`):** a lightweight page with a single ticket-code field powered by the public `/attendee/claim` proxy. It displays total sats + bundle count and offers copy-to-clipboard buttons per token so guests can paste them into their Cashu wallet.

---

Licensed under MIT (matching Lakeside).
