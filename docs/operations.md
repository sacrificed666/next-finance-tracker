# 🛠️ Operations

## 🧱 Three stacks, one Makefile

`docker-compose.yml` holds what is shared; `docker/development.yml`, `docker/staging.yml` and
`docker/production.yml` overlay the differences. Every target exists in three flavours:

| Verb | Dev | Staging | Production |
| --- | --- | --- | --- |
| Build image | `make dev-build` | `make stage-build` | `make prod-build` |
| Start | `make dev-up` | `make stage-up` | `make prod-up` |
| Stop | `make dev-down` | `make stage-down` | `make prod-down` |
| Restart | `make dev-restart` | `make stage-restart` | `make prod-restart` |
| Logs | `make dev-logs` | `make stage-logs` | `make prod-logs` |
| Status | `make dev-ps` | `make stage-ps` | `make prod-ps` |
| Shell | `make dev-shell` | `make stage-shell` | `make prod-shell` |
| psql | `make dev-psql` | `make stage-psql` | `make prod-psql` |
| Apply schema | `make dev-migrate` | `make stage-migrate` | `make prod-migrate` |
| Backup | `make dev-db-backup` | `make stage-db-backup` | `make prod-db-backup` |
| Restore | `make dev-db-restore FILE=…` | `make stage-db-restore FILE=…` | `make prod-db-restore FILE=…` |
| Full roll-out | `make dev-deploy` | `make stage-deploy` | `make prod-deploy` |

`make prod-deploy` takes a backup **before** building, which is the difference that matters.

> [!CAUTION]
> `make *-destroy` removes containers *and volumes*. On production that is the database.

## 🔥 Development

The dev container mounts the repository and runs `next dev`. Two details are worth knowing:

- `npm run dev:docker` starts Next.js with the webpack dev server because Turbopack does not pick up
  file changes through a bind mount on Windows and macOS hosts; `WATCHPACK_POLLING=true` then makes
  watching reliable. Locally, outside Docker, `npm run dev` with Turbopack is faster.
- `/app/.next` and `/app/node_modules` are anonymous volumes, so host artefacts never leak into the
  container.

- Stylesheets are **Sass**, so the `sass` package has to exist inside the container. After any
  dependency change run `make dev-build` (or `docker compose exec app npm install`), otherwise the
  dev server cannot compile `globals.scss`.

> [!TIP]
> If a change does not appear, clear the build cache instead of guessing:
> `docker exec <app> sh -c "rm -rf /app/.next/*" && make dev-restart`. A container that has been
> running while many files changed can also serve stale chunks — `make dev-restart` is the cheap fix.

## 🧬 Migrations

There is no migration tool — `db/schema.sql` is idempotent and is the migration:

1. Add the table or column with `IF NOT EXISTS`.
2. Update the matching `CHECK` constraint by dropping and recreating it.
3. Run `make dev-migrate`, then the same target on staging and production.

> [!WARNING]
> Always dump before migrating real data: `make prod-db-backup`. Restores are `psql` replays, so a
> dump is the only rollback you have.

## 💾 Backups

```bash
make prod-db-backup                       # → backups/prod-YYYYmmdd-HHMMSS.sql
make prod-db-restore FILE=backups/prod-….sql
```

Backups are plain `pg_dump` output. Keep them outside the server as well — the `backups/` folder is
ignored by Git on purpose.

## 🩺 Health and troubleshooting

| Symptom | Where to look |
| --- | --- |
| Redirect loop at `/login` | `AUTH_SECRET` changed, or the session cookie is blocked |
| 500 on save | A new enum value missing from a `CHECK` constraint in `db/schema.sql` |
| Blank exchange rates | Monobank rate limit (one request per five minutes) — the NBU fallback covers it |
| Cryptocurrency prices missing | CoinGecko throttling; previous prices are kept and the error is shown inline |
| Inzhur values stale | `/api/inzhur` caches for 10 minutes; check container logs for scrape failures |
| Logos redirect to `/login` | A public folder missing from the `proxy.ts` matcher |

Container logs: `make dev-logs` (or `stage-` / `prod-`). The app logs one line per request with the
route, status and timing.
