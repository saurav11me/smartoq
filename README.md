# Smart Vehicle QR

SmartO vehicle identity and private communication web application. The repository now contains a first runnable implementation of the product blueprint.

## Run locally

Requires Node.js 24 or newer. No third-party npm package is needed for this first implementation; the API and persistent local database use Node's built-in HTTP and SQLite modules.

```powershell
node server.mjs
```

Open <http://localhost:3000>.

### Synthetic demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Program administrator | `admin@smarto.local` | `SmartO-Demo-2026!` |
| Vehicle owner | `owner@smarto.local` | `Owner-Demo-2026!` |

The app seeds synthetic demo vehicles, one active QR and one showroom-stock QR into `data/smart-vehicle.sqlite`. Keep the database file private. Remove the demo users and replace authentication configuration before any shared deployment.

## What works in this first build

- Password sign-in with server-side scrypt verification, hashed session tokens, HTTP-only SameSite cookies, role checks, request limits and audit events.
- Admin dashboard, QR registry, batch creation (up to 10,000 unique identities), status filters, showroom and verified vehicle views, public scan inbox and audit history.
- QR lifecycle operations from generation through QC, warehouse/showroom stock, assignment, installation confirmation, activation and blocking/deactivation. Invalid transitions are rejected. Activation needs an authorized role, installation confirmation and final scan confirmation.
- Public mobile scan portal at `/scan/<opaque-token>`, category selection, private alert submission, active/inactive QR handling and rate limits. It never returns an owner's phone number.
- Owner portal at `/owner` with linked vehicles and received QR messages.
- Responsive SmartO-inspired navy/blue/cyan interface. The generated QR identities have scan URLs in the protected admin registry.

## Architecture

This is a dependency-free modular monolith for local development: `server.mjs` contains transport/authentication, `src/db.mjs` owns the database schema and synthetic seed, `src/operations.mjs` owns lifecycle and communication rules, and `public/` holds the browser application. SQL tables are separated by domain and indexed; inventory/audit events are append-only records. SQLite is only the local starter database.

Before production, move persistence to managed PostgreSQL, add migration tooling and a PostgreSQL repository adapter, replace seeded password login with an approved identity/OTP provider, add CSRF/session rotation and account recovery controls, configure secrets/TLS/WAF/monitoring/backups, and perform security, privacy, load and restore reviews. The current demo is single-process and its in-memory rate limits are not distributed.

Production-mode startup deliberately refuses to use the demo database/accounts. Initialize a clean production database and provide `BOOTSTRAP_ADMIN_EMAIL` and a `BOOTSTRAP_ADMIN_PASSWORD` of at least 14 characters for the first administrator. Set `NODE_ENV=production`, `HOST=0.0.0.0` behind an approved TLS-terminating reverse proxy, and a managed `SQLITE_PATH` only for isolated evaluation; do not use SQLite for the state-wide production deployment.

## Integrations that are not live

The D2C screen is a setup/readiness page, not a checkout. No real payment, OTP, SMS, email, push, phone relay, shipping, government vehicle lookup or emergency-service provider is connected. Public alert submission writes to the owner/admin inbox; it does not send an external notification. QR print artwork/code image generation, vendor QC evidence upload, showroom account onboarding, D2C order/returns, ownership transfer and full replacement history remain implementation work. Do not represent demo state as production evidence or government endorsement.

## QR flow

An active demonstration scan link is available by signing in as admin, opening **QR operations**, and choosing **Scan page** on the active demo unit. A freshly generated batch starts in `GENERATED`; advance a unit through its allowed actions. Scan URLs are bearer links: share only the printed QR with the intended vehicle. Public QR payloads contain an opaque random token, never owner data.

See [Smart Vehicle QR Developer Blueprint and Roadmap](./Smart_Vehicle_QR_Developer_Blueprint_Roadmap_v2.0.docx) for the consolidated requirements, phases, exit criteria and production decisions.
