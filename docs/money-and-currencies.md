# 💱 Money and currencies

## 🪙 Supported currencies

| Code | Symbol | Role |
| --- | --- | --- |
| `UAH` | ₴ | Default base currency, the unit every internal metric uses |
| `USD` | $ | Foreign |
| `EUR` | € | Foreign |

The **base currency** (Settings → General) decides what totals, charts and forecasts are shown in.
Individual accounts, investments, debts and transactions keep their own currency; conversion happens
only for display and aggregation.

> [!NOTE]
> `displayCurrencies(state)` shows a currency only once you actually use it — as the base currency or
> on an account, investment, debt, subscription, recurring rule or transaction — so tables stay
> narrow.

## 📈 Exchange rates

Rates live in `settings.rates` as "one unit of foreign currency in UAH". `settings.ratesMeta` keeps
the buy/sell pair behind each number, and `ratesSource` records where it came from.

| Source | Endpoint | Notes |
| --- | --- | --- |
| Monobank | `api.monobank.ua/bank/currency` | Preferred; rate-limited to one request per 5 minutes |
| NBU | `bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json` | Fallback, official mid rate |
| Manual | — | Typing a rate in Settings switches the source to `manual` |

Rates refresh **automatically at the top of every hour** (10:00, 11:00, …) and right after a load when
the stored numbers are older than an hour. There is no refresh button: Settings shows when the last
update happened and when the next one is due.

Conversions use the **buy** rate: what you would actually receive when selling foreign currency.

```ts
convert(amount, "USD", "UAH", rates)  // amount × rates.USD
convert(amount, "UAH", "USD", rates)  // amount ÷ rates.USD
convert(amount, "USD", "EUR", rates)  // through UAH
```

> [!WARNING]
> Rates are a snapshot, not a time series. Historical charts convert old amounts at today's rate —
> the app is a personal tracker, not an accounting ledger.

## 🔢 Formatting

`src/lib/money.ts` formats through `Intl.NumberFormat` using the active locale, so the same number
reads naturally in every language:

| Helper | Example (en) | Example (uk) |
| --- | --- | --- |
| `formatMoney(1234.5, "UAH")` | `1,235 ₴` | `1 235 ₴` |
| `formatMoney(1234.5, "UAH", { exact: true })` | `1,234.50 ₴` | `1 234,50 ₴` |
| `formatMoney(1234567, "UAH", { compact: true })` | `1.2M ₴` | `1,2M ₴` |
| `formatMoney(-500, "USD", { sign: true })` | `−$500` | `−$500` |
| `formatPercent(6.5)` | `6.5%` | `6,5%` |
| `formatNumber(0.00153021, 8)` | `0.00153021` | `0,00153021` |

`parseAmount` accepts what people actually type: spaces, non-breaking spaces, commas as decimal
separators, and a leading currency symbol.

> [!TIP]
> Use the typographic minus (`−`) that `formatMoney` produces instead of a hyphen when you write
> amounts by hand in the UI — it aligns with tabular numbers.

## 🧾 Rounding rules

- Nothing is rounded in storage: amounts keep full precision as entered.
- Display rounds to whole units by default and to two decimals with `exact: true`.
- Cryptocurrency quantities are shown with up to 8 decimals (`formatNumber(value, 8)`).
- Comparisons that decide UI state (for example "balance reached the goal") use the raw values, not
  the rounded strings.
