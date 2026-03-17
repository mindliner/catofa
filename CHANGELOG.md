# Changelog

## 2026-03-17

- Added a multi-stage Dockerfile that builds the Catofa UI plus the Lakeside CLI and exposes persistent volumes for tickets + wallet data.
- Shipped a `docker-compose.yml` + `.env.example` for turnkey conference deployments (Compose targets the sibling `lakeside` repo automatically).
- Documented the Compose workflow and configuration knobs in the README.
