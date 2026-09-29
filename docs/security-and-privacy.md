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
| Rate limits | 10 sign-in attempts per email and 5 registrations per address every 15 minutes, plus 10 password changes, 10 two-step confirmations and 5 test notifications |
| Google sign-in | Optional; appears only when `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set |
| Two-step verification | Optional TOTP (RFC 6238: SHA-1, six digits, 30-second steps, one step of clock drift either way) on top of the password |
| Recovery codes | Eight single-use codes, shown once, stored as SHA-256 hashes and compared in constant time |
| Code replay | Each code works once: the server remembers the last step an account signed in with |
| Sign out everywhere | Raises `users.session_epoch`; every session carries the epoch it started with and ends when they differ |

The Profile page adds a strength meter and a confirmation field, but the server remains the authority
on what is acceptable.

### Two-step verification

Profile → Sign-in → *Two-step verification* shows a QR code and the same key as text for any
authenticator app, and turns on only after the first code from that app is accepted. The recovery
codes appear once, with buttons to copy or download them. From then on, signing in with email and
password asks for the current code; a recovery code works in the same field and is used up.

| Rule | Why |
| --- | --- |
| Turning it off needs a current code or a recovery code | A session left open on someone else's computer cannot remove the second step |
| It cannot be set up again while it is on | Replacing the secret would need no proof of the old one; turn it off first |
| Code attempts count towards the 10 sign-in attempts | Six digits cannot be guessed inside the limit |
| The secret lives in `users.two_factor`, sealed like every record | A database dump does not reveal it |

It covers email-and-password sign-in only. Google sign-in relies on the protection of the Google
account itself.

> [!WARNING]
> Losing the phone and every recovery code locks the account behind the second step. The owner of the
> server can still turn it off from the database — see
> [Operations](./operations.md#locked-out-of-two-step-verification).

### Sign out everywhere

The button under the sign-in methods ends every session of the account, the current one included.
Sessions are signed cookies, so nothing is deleted: the server raises `users.session_epoch`, and each
check of a session compares it with the epoch stored in the cookie. Every server process caches the
epoch for 30 seconds, so an instance other than the one that handled the click notices within that
time. A browser whose session has ended gets the sign-in form on its next request.

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
| `users` | Name, avatar, about, occupation, location, link and birthday; the two-step verification secret and recovery-code hashes |
| `category_rules`, `receivables`, `wishlist_items`, `planned_events`, `net_worth_snapshots` | The whole entity — these tables have no other columns |
| `integrations` | The Monobank token and card list |
| `push_subscriptions` | Each device's push address and keys |
| `attachments` | The receipt photo itself |

Each row keeps only its `id`, its `user_id` and a `secret` column that holds
`enc.v1.<iv+tag+ciphertext>` in base64; the old plaintext columns are written as `NULL`. A dump of the
database therefore shows which rows exist, but not a single amount, name or note.

| Variable | Meaning |
| --- | --- |
| `DATA_ENCRYPTION_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`). The key that seals every record |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | Optional — the key before the current one, while records move over after a change of key |
| `AUTH_SECRET` | Used to derive a key when `DATA_ENCRYPTION_KEY` is missing, so records are never written in the clear |

Records are always sealed with the current key: `DATA_ENCRYPTION_KEY`, or the key derived from
`AUTH_SECRET` when it is not set. Reading tries the current key first, then
`DATA_ENCRYPTION_KEY_PREVIOUS`, then the key derived from `AUTH_SECRET` (`lib/sealing.ts`). The first
time an account loads its data after the server starts, every record of that account that only an
older key opens is sealed again with the current one — across all sealed tables and columns, in one
transaction (`lib/server/reseal.ts`). The server logs `re-sealed N records` when it does.

That makes a change of key an edit to `.env` and a restart — see
[Operations](./operations.md#changing-the-encryption-key).

> [!CAUTION]
> Losing the key means losing the data — there is no recovery path. Keep `DATA_ENCRYPTION_KEY` in your
> password manager alongside your database backups. A record sealed with a key the server does not
> have stops loading with "A record is sealed with a key this server does not have".

> [!NOTE]
> Rows written before this feature are still readable: the loader falls back to the plaintext columns
> and re-seals them on the next save.

## 🛡️ Request authorisation

Every API route calls `auth()` and answers `401` without a session, including `/api/inzhur`. There
are two exceptions. `POST /api/monobank/webhook/<key>` is where Monobank delivers new operations: it
has no session, so the 24-byte random key in the address is what identifies the user (compared in
constant time, rate-limited, `404` for anything unknown). Treat that address like a password — it
only ever travels between the server and Monobank. `POST /api/push/remind` sends the morning
notifications and is called by the server itself; it needs a token derived from `AUTH_SECRET` and
answers `404` without it. The middleware additionally gates pages, so a
browser without a session cookie never renders app HTML; one whose session has ended gets only the
empty shell, and its first data request answers `401` and sends it to sign in.

`PATCH /api/state` also:

- accepts only a change set of known collections (`parseChanges`), then merges it into the stored
  state and runs the result through `normalizeState` before anything is written;
- writes only the records whose content changed, so one edit re-seals one record.

## 🌐 What leaves your machine

| Call | Data sent | Who makes it |
| --- | --- | --- |
| Monobank / NBU rates | Nothing but the request | Browser |
| CoinGecko prices | Coin ids and a target currency | Browser |
| Inzhur fund pages | Nothing but the request | Server |
| Monobank personal API | Your token, a card id and a period — only when you connect or load a statement | Server |
| NBU rate by date | A currency and a date | Server |
| Flags (flagcdn), brand favicons | The image URL | Browser |
| Notifications | The morning note, encrypted for your device — the push service sees only its size and time | Server |

> [!IMPORTANT]
> No amounts, balances, categories or names are sent anywhere in readable form: the one message that
> carries them, the morning notification, is encrypted end to end for your device
> ([Notifications](./notifications.md)). Everything else stays in your PostgreSQL database. The
> Monobank token is sealed on the server and is never sent back to the browser, not even masked.

The installed app's service worker (`public/sw.js`) caches only the build's static files and icons,
and shows notifications. Pages and API responses are never stored on the device.

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

Every response carries a strict set of headers from `next.config.ts`: `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` (camera,
microphone, geolocation and payments disabled), `X-Robots-Tag: noindex`, and
`Strict-Transport-Security` in production. API routes are additionally `Cache-Control: no-store`.

Pages also get a `Content-Security-Policy` of their own, built in `lib/csp.ts` and set by `proxy.ts`
with a fresh nonce for every request:

| Directive | Allows |
| --- | --- |
| `script-src` | `'nonce-…' 'strict-dynamic'` — only scripts carrying that request's nonce, and what they load; no inline scripts otherwise (`'unsafe-eval'` in development only, for React's error overlay) |
| `style-src` | The app's own styles and Google Fonts, inline styles included: React writes `style` attributes, which nonces cannot cover |
| `connect-src` | The app itself, Monobank, NBU and CoinGecko |
| `worker-src`, `manifest-src` | The app's own service worker and manifest |
| `frame-ancestors`, `object-src` | Nothing |

Next.js adds the nonce to its own scripts; the theme script in the root layout reads it from the
`x-nonce` request header.

## 📦 Deployment notes

- The production image is a standalone Next.js build running as a non-root user with a health check.
- PostgreSQL is not published to the host outside development.
- Put a TLS-terminating reverse proxy in front of the app and set `AUTH_URL` to the public origin.
- Rate limits count by the first address in `X-Forwarded-For`. Have the proxy replace that header
  rather than append to it, otherwise a client picks its own address and its own limit.

> [!CAUTION]
> Never reuse the development `POSTGRES_PASSWORD` or `AUTH_SECRET` in production, and never commit a
> real `.env` — only `.env.example` belongs in the repository.
