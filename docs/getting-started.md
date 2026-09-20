# 🚀 Getting started

## ✅ Requirements

| Tool | Version | Why |
| --- | --- | --- |
| Docker + Compose | v2 | Runs the app and PostgreSQL |
| GNU Make | any | Every command lives in the `Makefile` |
| Node.js | 26+ | Only needed to run checks outside Docker (`tsc`, `eslint`, `next build`) |

> [!TIP]
> `make doctor` verifies your toolchain and `.env` before you start anything.

## 🔐 Environment

Copy the template and fill it in — `make env` does this for you if `.env` is missing:

```bash
make env
```

| Variable | Meaning |
| --- | --- |
| `APP_ENV` | `development`, `staging` or `production`; picks the compose overlay |
| `APP_PORT` | Host port for the app (default `3000`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database credentials |
| `POSTGRES_PORT` | Host port for PostgreSQL — only published in development |
| `DATABASE_POOL_MAX` | Upper bound of the `pg` pool |
| `AUTH_SECRET` | Auth.js signing secret — `openssl rand -base64 32` |
| `DATA_ENCRYPTION_KEY` | Key that encrypts every stored record — `openssl rand -base64 32` |
| `AUTH_URL` | Public origin, e.g. `https://money.example.com` |
| `OWNER_EMAIL` | The only address allowed to register; everyone else is rejected |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Optional — Google sign-in appears only when both are set |

> [!CAUTION]
> `DATA_ENCRYPTION_KEY` is the key to your data. Back it up with your database dumps — without it the
> records cannot be read. If it is missing, a key is derived from `AUTH_SECRET` instead, which ties
> your data to that secret.

> [!WARNING]
> `AUTH_SECRET` must be stable. Changing it signs every session out and makes existing session
> cookies useless.

## ▶️ First run

```bash
make dev-deploy      # build image → start stack → apply db/schema.sql
```

Then open <http://localhost:3000>. The first visit redirects to `/login`; create the owner account on
`/register` using the address in `OWNER_EMAIL` and a password of at least 10 characters.

> [!IMPORTANT]
> Registration is closed by design. `OWNER_EMAIL` is the allow-list — this app is meant to hold one
> person's finances, not to be a multi-tenant service.

## 🧭 Everyday commands

```bash
make dev-up          # start (hot reload, detached)
make dev-logs        # follow logs
make dev-shell       # shell inside the app container
make dev-psql        # psql inside the database container
make dev-migrate     # re-apply db/schema.sql
make dev-db-backup   # dump into backups/dev-<timestamp>.sql
make dev-down        # stop
```

Run `make` with no target for the full, grouped list — staging and production mirror the same verbs
with `stage-` and `prod-` prefixes.

## 🧪 Checks outside Docker

```bash
npm install          # once, for the local toolchain
npx tsc --noEmit     # types, including every translation key
npx eslint src       # lint
npx next build       # production build
```

See [Quality checks](./quality-checks.md) for the browser smoke tests and the dictionary validator.

## 🧱 What to read next

- [Architecture](./architecture.md) — how a request becomes a page and where state lives.
- [Operations](./operations.md) — deployments, backups, restores and the hot-reload caveat on
  Windows hosts.
