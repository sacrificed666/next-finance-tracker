# 🔒 Security and privacy

## 👤 One owner, one account

Registration is limited to the address in `OWNER_EMAIL`; `POST /api/auth/register` rejects anything
else. There is no invite flow, no roles and no sharing — the app is built for a single person's
finances.

## 🔑 Sessions and passwords

| Concern | Implementation |
| --- | --- |
| Session | Auth.js with JWT strategy, HTTP-only cookie, signed with `AUTH_SECRET` |
| Credentials | Email + password, verified against `users.password_hash` |
| Hashing | `scrypt` with a random 16-byte salt, 64-byte key, stored as `scrypt$<salt>$<hash>` |
| Comparison | `timingSafeEqual`, and a dummy hash when the user does not exist, so timing does not leak account existence |
| Minimum password | 10 characters, enforced server-side (`passwordProblem`) |
| Hash parameters | `scrypt` N = 2¹⁷, r = 8, p = 1, stored inside the hash; older hashes are upgraded on the next successful sign-in |
| Rate limits | 10 sign-in attempts per email and 5 registrations per address every 15 minutes, plus 10 password changes |
| Google sign-in | Optional; appears only when `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set |

The Profile page adds a strength meter and a confirmation field, but the server remains the authority
on what is acceptable.

> [!WARNING]
> Rotating `AUTH_SECRET` invalidates every session. Keep it in `.env` only, and keep `.env` out of
> version control (it already is).

## 🔐 Encryption at rest

Every record is stored as an **AES-256-GCM** ciphertext, not as readable columns:

| Table | What is sealed |
| --- | --- |
| `transactions`, `categories`, `recurring_rules`, `subscriptions` | The whole entity, including amounts, notes and dates |
| `savings_accounts`, `investments`, `budgets`, `debts` | The whole entity, including balances and coin holdings |
| `settings` | Everything except the interface language |
| `users` | Name, avatar, about, occupation, location, link and birthday |
| `category_rules`, `receivables`, `wishlist_items`, `planned_events`, `net_worth_snapshots` | The whole entity — these tables have no other columns |
| `integrations` | The Monobank token and card list |
| `attachments` | The receipt photo itself |

Each row keeps only its `id`, its `user_id` and a `secret` column that holds
`enc.v1.<iv+tag+ciphertext>` in base64; the old plaintext columns are written as `NULL`. A dump of the
database therefore shows which rows exist, but not a single amount, name or note.

| Variable | Meaning |
| --- | --- |
| `DATA_ENCRYPTION_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`). The key that seals every record |
| `AUTH_SECRET` | Used to derive a key when `DATA_ENCRYPTION_KEY` is missing, so records are never written in the clear |

> [!CAUTION]
> Losing the key means losing the data — there is no recovery path. Keep `DATA_ENCRYPTION_KEY` in your
> password manager alongside your database backups, and never rotate it without re-encrypting first
> (load the state with the old key, save it with the new one).

> [!NOTE]
> Rows written before this feature are still readable: the loader falls back to the plaintext columns
> and re-seals them on the next save.

## 🛡️ Request authorisation

Every API route calls `auth()` and answers `401` without a session, including `/api/inzhur`. The
middleware additionally gates pages, so an unauthenticated browser never renders app HTML.

`PUT /api/state` also:

- normalises and validates the payload before writing (`normalizeState`);
- compares an `ETag` to reject stale writes from another tab or device.

## 🌐 What leaves your machine

| Call | Data sent | Who makes it |
| --- | --- | --- |
| Monobank / NBU rates | Nothing but the request | Browser |
| CoinGecko prices | Coin ids and a target currency | Browser |
| Inzhur fund pages | Nothing but the request | Server |
| Monobank personal API | Your token, a card id and a period — only when you connect or load a statement | Server |
| NBU rate by date | A currency and a date | Server |
| Flags (flagcdn), brand favicons | The image URL | Browser |

> [!IMPORTANT]
> No amounts, balances, categories or names are sent anywhere. Everything else stays in your
> PostgreSQL database. The Monobank token is sealed on the server and is never sent back to the
> browser, not even masked.

The installed app's service worker (`public/sw.js`) caches only the build's static files and icons.
Pages and API responses are never stored on the device.

## 🧪 Input hardening

- Avatar URLs must be `https:` and shorter than 500 characters.
- Custom game logo URLs must be `https:` and are re-validated on every load.
- Coin icons are accepted only from CoinGecko's domain.
- Text fields are length-limited (name 80, about 500, labels 60).
- Numbers are clamped during normalisation (rates > 0, percentages 0–200, quantities ≥ 0).
- Receipt photos are shrunk to WebP in the browser; the server accepts only WebP, JPEG or PNG up to
  1.5 MB, at most 30 uploads a minute, and serves them back only to their owner.
- Tags are trimmed, de-duplicated regardless of case, at most 24 characters and 8 per entry.

## 🧱 Response headers

Every response carries a strict set of headers from `next.config.ts`:

`Content-Security-Policy` (self-hosted scripts and styles, with only Monobank, NBU and CoinGecko as
allowed `connect-src` targets), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: same-origin`, `Permissions-Policy` (camera, microphone, geolocation and payments
disabled), `X-Robots-Tag: noindex`, and `Strict-Transport-Security` in production. API routes are
additionally `Cache-Control: no-store`.

## 📦 Deployment notes

- The production image is a standalone Next.js build running as a non-root user with a health check.
- PostgreSQL is not published to the host outside development.
- Put a TLS-terminating reverse proxy in front of the app and set `AUTH_URL` to the public origin.

> [!CAUTION]
> Never reuse the development `POSTGRES_PASSWORD` or `AUTH_SECRET` in production, and never commit a
> real `.env` — only `.env.example` belongs in the repository.
