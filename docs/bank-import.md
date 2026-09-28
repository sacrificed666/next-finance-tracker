# 🏦 Bank import

Entries can come straight from the bank instead of being typed: from Monobank's personal API, or
from a CSV statement any bank can export. Both end in the same preview, where every row gets a
category, duplicates start unticked, and nothing is booked until you confirm.

Everything lives in **Settings → Import from your bank**; the rules that pick categories sit right
below it, in **Auto-categorisation**.

## 🐈 Monobank

| Step | What happens |
| --- | --- |
| Connect | Paste the personal token from `api.monobank.ua`. The server checks it against `client-info`, then seals the token and the card list into the `integrations` table |
| Link cards | Each Monobank card is linked to one of your accounts (`settings.bankLinks`). Cards left unlinked are skipped |
| Load | Pick 7, 14 or 31 days. Linked cards are read one after another; entries are booked to the linked account in the card's currency |
| Disconnect | Deletes the `integrations` row, token included |

> [!IMPORTANT]
> The token never reaches the browser. `GET /api/monobank` returns only the card list (masked
> number, currency); statements are fetched by the server with the sealed token.

Monobank answers one statement request per minute. The server keeps 61 seconds between calls per
user and, when asked too early, answers `429` with `wait:<seconds>`; the import card shows the
countdown and carries on by itself. One request covers at most 31 days and an hour
(`MONO_MAX_RANGE_S` in `lib/server/monobank.ts`).

## 📄 CSV statements

- **Reading the file.** UTF-8 first, Windows-1251 when the text comes out garbled (older Ukrainian
  exports). The delimiter (`;`, `,` or tab), quotes and a byte-order mark are handled in
  `lib/finance/csv.ts`.
- **Columns.** A mapping sheet guesses date, description, amount, an optional separate "money out"
  column and MCC from the header row, in Ukrainian or English; you can correct each one and choose
  the statement's currency and account.
- **Numbers and dates.** `1 234,56`, `1,234.56` and `-1234.56` all read correctly, and so do
  `31.12.2026`, `31/12/2026` and `2026-12-31`. Rows without a date or an amount (totals, blank lines)
  are skipped.

## 🏷️ Picking the category

`suggestCategory` in `lib/finance/import.ts` tries, in order:

1. **Your rules** — "description contains … → category", per type. Add them in Settings → Auto-categorisation.
2. **The merchant code** (MCC) for expenses — groceries, restaurants, transport, fuel, pharmacies,
   utilities and so on map to the default categories.
3. **Cashback** in the description for income.
4. "Other expenses" / "Other income".

## 🔁 Duplicates

Every imported entry keeps an `externalId` — `mono:<id>` for Monobank, `csv:<fingerprint>` for a
statement row. A candidate is marked as already booked when its `externalId` is in the ledger, or
when an entry with the same date, type, amount and note exists (for entries typed by hand before the
import). Duplicates start unticked, so loading the same week twice adds nothing.
