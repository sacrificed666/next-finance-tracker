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

The dev container mounts the repository and runs `next dev`. A few details are worth knowing:

- `npm run dev:docker` starts Next.js with the webpack dev server because Turbopack does not pick up
  file changes through a bind mount on Windows and macOS hosts; `WATCHPACK_POLLING=true` then makes
  watching reliable. Turbopack's own `watchOptions.pollIntervalMs` was tried with Next.js 16.3 and did
  not help: no edit reached it within a minute, where webpack showed it in about five seconds.
  Locally, outside Docker, `npm run dev` with Turbopack is faster.
- `/app/.next` and `/app/node_modules` are anonymous volumes, so host artefacts never leak into the
  container.
- Stylesheets are **Sass**, so the `sass` package has to exist inside the container. After any
  dependency change run `make dev-build` (or `docker compose exec app npm install`), otherwise the
  dev server cannot compile `globals.scss`.
- The service worker registers in production builds only, so a stored script never hides a change
  being worked on; notifications and the offline note need `make stage-up` or a production build.
- The dev server watches `src/app/globals.scss` but not the partials it pulls in from `src/styles/`.
  After editing a partial, save `globals.scss` as well (any save, even unchanged) and the change shows
  in a few seconds — no restart needed.

> [!TIP]
> If a change does not appear, clear the build cache instead of guessing:
> `docker exec <app> sh -c "rm -rf /app/.next/*" && make dev-restart`. A container that has been
> running while many files changed can also serve stale chunks — `make dev-restart` is the cheap fix.

## 🧬 Migrations

There is no migration tool — `db/schema.sql` is idempotent and is the migration:

1. Add the table or column with `IF NOT EXISTS`. A new record type that needs no queryable columns
   goes into the sealed-only loop at the end of the file — `(user_id, id, secret)` and nothing else.
2. Update the matching `CHECK` constraint by dropping and recreating it.
3. Run `make dev-migrate`, then the same target on staging and production.

> [!WARNING]
> Always dump before migrating real data: `make prod-db-backup-now`. A dump is the only rollback you
> have.

## 💾 Backups

Production backs itself up. The `backup` service in `docker/production.yml` runs
`docker/backup.sh`:

- every night at `BACKUP_HOUR` (in `TZ`, `Europe/Kyiv` by default) it writes a compressed
  `pg_dump` to `backups/auto/prod-YYYYmmdd-HHMMSS.dump`;
- it reads each dump back with `pg_restore --list` before keeping it, so a broken file is logged
  and dropped instead of silently replacing a good one;
- it deletes dumps older than `BACKUP_KEEP_DAYS` (14 by default);
- on start it takes one straight away when today has none, so a fresh deploy is covered at once.
- with `BACKUP_ONCE=1` it takes a single dump and exits — what `make prod-db-backup-now` runs.

The script runs inside a Linux container, so `.gitattributes` keeps every `*.sh` file with LF line
endings even in a Windows checkout — a CRLF copy would not run.

### Changing the encryption key

The app sees only the variables `docker-compose.yml` passes to it; `.env` itself never enters the
image. Records move to a new key by themselves the first time the account loads after a restart
(see [Security and privacy](./security-and-privacy.md#-encryption-at-rest)).

| Situation | What to put in `.env` |
| --- | --- |
| Records sealed with the key derived from `AUTH_SECRET` (no `DATA_ENCRYPTION_KEY` set so far) | A new `DATA_ENCRYPTION_KEY`; keep `AUTH_SECRET` as it is until the move is done |
| Replacing `DATA_ENCRYPTION_KEY` | The new key as `DATA_ENCRYPTION_KEY`, the old one as `DATA_ENCRYPTION_KEY_PREVIOUS` |

1. `make prod-db-backup-now` — the dump is the way back.
2. Edit `.env`, then `make prod-up` so the container starts with the new variables.
3. Open the app once and look for `re-sealed N records` in `make prod-logs`.
4. After that, `DATA_ENCRYPTION_KEY_PREVIOUS` can be removed, and `AUTH_SECRET` may change again.

> [!NOTE]
> The notification key is derived from the same secret, so after a change of key each device has to
> switch reminders on again in Settings.

```bash
make prod-backups                          # list the nightly dumps
make prod-db-backup-now                    # one more, checked, next to the nightly ones
make prod-db-backup                        # a plain SQL dump → backups/prod-YYYYmmdd-HHMMSS.sql
make prod-db-restore FILE=backups/auto/prod-….dump   # .dump or .sql — the target picks the tool
make prod-logs                             # the backup service logs a line for every run
```

> [!IMPORTANT]
> A dump is the database as stored: every financial record inside is still sealed with
> `DATA_ENCRYPTION_KEY`. Without that key a backup restores rows nobody can read, so keep the key
> in a password manager — never in the same place as the dumps.

`backups/` is ignored by Git on purpose. Copy it off the server as well (a nightly `rsync` or
`rclone` of `backups/auto` is enough): a backup on the same disk does not survive that disk.

## 🩺 Health and troubleshooting

| Symptom | Where to look |
| --- | --- |
| Every device asked to sign in again | `AUTH_SECRET` changed, or *Sign out everywhere* was used on the Profile page |
| Sign-in keeps asking for a code that is right | The phone's clock is off by more than 30 seconds — turn on automatic time |
| Phone and recovery codes both lost | Turn two-step verification off from the database, below |
| No morning notification | Nothing was due, the device's switch is off, or the browser blocks the site; **Send a test** in Settings tells which |
| Notifications stopped after a secret changed | The push key follows `DATA_ENCRYPTION_KEY` (or `AUTH_SECRET`); switch reminders on again on each device |
| 500 on save | A new enum value missing from a `CHECK` constraint in `db/schema.sql` |
| Blank exchange rates | Monobank rate limit (one request per five minutes) — the NBU fallback covers it |
| Cryptocurrency prices missing | CoinGecko throttling; previous prices are kept and the error is shown inline |
| Inzhur values stale | `/api/inzhur` caches for 10 minutes; check container logs for scrape failures |
| Logos redirect to `/login` | A public folder missing from the `proxy.ts` matcher |
| Monobank import waits a minute per card | Monobank allows one statement request a minute; the card counts down and continues |
| "Monobank didn't accept this token" | The personal token was revoked or mistyped — create a new one at `api.monobank.ua` |
| Installed app shows an old version | The service worker is fetched with `no-store`; closing every window of the app picks up the new one |

Container logs: `make dev-logs` (or `stage-` / `prod-`). The app logs one line per request with the
route, status and timing.

### Locked out of two-step verification

Only the server's owner can do this, and it needs nothing but database access. Open `psql` with
`make prod-psql` (or `dev-` / `stage-`) and clear the column for the account:

```sql
UPDATE users SET two_factor = NULL WHERE lower(email) = 'you@example.com';
```

Sign in with the password alone, then set two-step verification up again on the Profile page.
