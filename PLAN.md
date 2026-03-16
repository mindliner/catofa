# Catofa Plan

## Next deliverables
1. **Deployment packaging**
   - Build a multi-stage Dockerfile (Rust + Node) that bundles Lakeside + Catofa, mounts persistent `tickets.json`/wallet data, and exposes port 4077.
   - Provide a `docker-compose.yml` + sample `.env` so conference organizers can `docker compose up -d` with minimal setup.
   - Alternative: document a systemd/PM2 install script for non-container environments.
2. **Branding / attendee UX**
   - Allow organizers to set logo, accent colors, and copy for the "Get your token" page via env vars / config file.
   - Add optional hero text + footer links (Code of Conduct, privacy, etc.).

## Nice-to-haves
- Email/slack notifications for faucet health (process exit, low wallet balance).
- Role-based access (operator view gated behind password, public attendee view open).
- Deployment docs for Fly.io/Render in addition to Docker/systemd.

## Status
- ✅ Core UI + QR invoice support shipped (see README for usage).
- 🔜 Deployment + branding work queued (see tasks above).
