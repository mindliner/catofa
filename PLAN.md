# Catofa Plan

## Latest progress
- **2026-03-16** – Shipped the standalone React + Express UI: CSV/paste ticket import, wallet funding with live logs + QR invoices, faucet controls with start/stop + log tailing, attendee "Get Your Token" claim page.
- Added runtime data dir defaults (`catofa/runtime`), `LAKESIDE_BIN` auto-detection, and README walkthrough for setup.
- **2026-03-17** – Finished the Docker/Compose packaging (multi-stage build with Lakeside binary, `.env` sample, nginx reverse-proxy recipe) and validated the production deployment at `catofa.mountainlake.io`.
- **2026-03-18** – Split the attendee portal onto `/attendee` + `/attendee/claim`, added the `CATOFA_CONTROL_ROOM_KEY` guard for the control room/API, and documented the new workflow (README + Compose redeploy steps).

## Next deliverables
1. **Deployment packaging** (owner: Logom)
   - ✅ Write a multi-stage Dockerfile that bundles the Lakeside binary + Catofa UI, persists `tickets.json` and wallet data, and exposes port 4077.
   - ✅ Provide a `docker-compose.yml` and sample `.env` for turnkey installs.
   - Document a non-container path (systemd or PM2 script) for organizers who prefer bare-metal deployments.
2. **Branding / attendee UX**
   - Add env/config-driven overrides for logo, accent colors, strings on the GetYourToken page.
   - Allow optional hero text + footer links (CoC, privacy, help) on the attendee surface.
   - Polish copy + empty states on the operator dashboard.
3. **API hardening**
   - ✅ Gate `/api/*` plus the operator UI behind `CATOFA_CONTROL_ROOM_KEY` while keeping `/attendee/claim` public.
   - Add an IP-based rate limiter to `/api/claim` (configurable burst/window, default 5 req/min/IP).
   - Optionally surface a 429 banner in the attendee UI when throttled so people know to try again.

## Nice-to-haves
- Health alerts when the faucet process dies or wallet balance falls under a threshold (email/Slack webhook).
- Lightweight role-based access: password-protect operator view while keeping attendee page public.
- Deployment docs for managed hosts (Fly.io, Render) once Docker/systemd path is stable.

## Status
- ✅ Core UI + QR invoice flow is live (see Latest progress + README for details).
- 🟡 Deployment packaging: Docker/Compose path shipped; systemd/bare-metal guide still pending.
- 🟡 Branding knobs not implemented yet; needs design decisions from organizers.
- 🟡 API hardening: control-room key + `/attendee` split are live; rate limiting + attendee-facing throttling messages still TBD.
