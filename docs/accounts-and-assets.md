# 🏦 Accounts and assets

## 🗂️ Account kinds

| Kind | Icon | What it is | Balance comes from |
| --- | --- | --- | --- |
| `card` | 💳 | Bank card | Opening balance + ledger |
| `cash` | 💵 | Physical money | Opening balance + ledger |
| `savings` | 🏦 | Savings account | Opening balance + ledger |
| `wallet` | 📲 | E-wallet (Wise, Revolut, PayPal, …) | Opening balance + ledger |
| `crypto` | 🪙 | Cryptocurrency wallet or exchange | Coin holdings at live prices + cash on the account |
| `skins` | 🎮 | Game items (CS2, Dota 2, TF2, Rust, PUBG or a custom game) | Opening balance + ledger |
| `other` | 📦 | Anything else | Opening balance + ledger |

Every account has a currency, an optional savings goal (target and deadline) and an optional brand or
game logo used as its mark.

## 🪙 Cryptocurrency accounts

One account represents one wallet or exchange and holds **several coins**:

```ts
interface CoinHolding {
  coin: string;      // CoinGecko id, e.g. "bitcoin"
  quantity: number;  // how many you hold
  price?: number;    // last fetched price in the account currency
  icon?: string;     // coin logo from CoinGecko
}
```

- The account balance is `Σ quantity × price` plus the cash sitting on the account
  (`openingBalance` + ledger movements).
- 25 popular coins are available (`src/lib/crypto.ts`), including BTC, ETH, USDT, SOL, TON, WBT.
- Prices come from CoinGecko in the account's own currency; **Load prices** in the form and
  **Prices** on the Balance page both refresh them, and saving fetches any missing price
  automatically.
- The account row lists its coins, so `0.0015 BTC · 0.031 ETH` is visible without opening anything.

> [!NOTE]
> Cryptocurrency can also be tracked as an investment position — one coin, one entry, with its cost
> basis and expected return. Use an account when several coins live in one place, and an investment
> when you want to track a single position's profit.

> [!TIP]
> Recording the fiat you keep on an exchange as "cash on the account" keeps net worth honest without
> inventing a stablecoin holding.

## 🎮 Game items

`skins` accounts model inventories whose value you check by hand. Five games with an active item
market ship with logos (CS2, Dota 2, Team Fortress 2, Rust, PUBG); anything else is a custom entry
with your own name and an optional HTTPS logo URL.

> [!WARNING]
> Game item accounts are excluded from the emergency-fund calculation — an inventory is not cash.

## 🏷️ Brands and logos

`src/lib/brands.ts` lists the supported brands in three groups:

| Group | Brands |
| --- | --- |
| Ukrainian banks | monobank, PrivatBank, Oschadbank, PUMB, Raiffeisen, Sense, A-Bank, OTP, UkrSib, Ukrgasbank, izibank |
| Fintech | Wise, Revolut, PayPal, Payoneer |
| Cryptocurrency exchanges | WhiteBIT, Binance, Bybit, OKX |

Logos are **self-hosted**: `public/brands/*.png` (128 px, from the official app icons) and
`public/games/*.png` (256 px, from the official game icons and vector logos), with remote favicon
services and the Steam CDN as a fallback chain. `RemoteLogo` walks the source list on error and skips images
smaller than 24 px, which used to slip through as blurry letter placeholders.

> [!CAUTION]
> `src/proxy.ts` excludes `brands/` and `games/` from the session gate. A new asset folder needs the
> same treatment, otherwise the middleware answers image requests with a redirect.

## 💸 Balancing and transfers

- **Reconcile** on a normal account compares the app's number with what the bank shows and posts a
  single adjusting entry to "Other income" or "Other expenses".
- Transfers move money between accounts; cross-currency transfers carry `toAmount`, so both sides
  stay exact.
- Cryptocurrency accounts have no reconcile button: their value follows the coin prices.

## 📊 Where accounts show up

| Screen | Use |
| --- | --- |
| Balance → Accounts | Table with per-currency columns, goals, search, kind filter, sorting |
| Dashboard | Net worth split by kind |
| Expenses / Income | Account picker on every entry, and account filters in the ledger |
| Profile → Financial health | Liquid accounts feed the emergency fund, all of them feed diversification |
