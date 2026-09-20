# 🌍 Internationalisation

## 🗣️ Locales

| Code | Language | Flag |
| --- | --- | --- |
| `en` | English (source of truth) | 🇬🇧 |
| `uk` | Ukrainian | 🇺🇦 |
| `de` | German | 🇩🇪 |
| `fr` | French | 🇫🇷 |
| `es` | Spanish | 🇪🇸 |
| `pl` | Polish | 🇵🇱 |
| `it` | Italian | 🇮🇹 |
| `nl` | Dutch | 🇳🇱 |

Flags are rendered from [flagcdn.com](https://flagcdn.com) by country code, never as emoji, so they
look identical on every platform.

## 🔑 The dictionary contract

`src/lib/i18n/dict/en.ts` defines the keys; every other dictionary must satisfy the same type:

```ts
export type MessageKey = keyof typeof en;
export type Dictionary = { [K in MessageKey]: string } & Record<string, string>;
```

> [!IMPORTANT]
> Adding a key to `en.ts` breaks the type check until all seven translations exist. That is
> deliberate: a missing translation is a compile error, not a runtime surprise.

## 🧰 Using translations

```tsx
const { t, tp, tk, category, locale, intl } = useT();

t("balance.title")                            // plain lookup
t("tax.limit.left", { pct, left })            // {placeholders}
tp("profile.stats.weeksValue", weeks)         // plural: .one / .few / .many / .other
tk(`ach.${id}.title`, id)                     // dynamic key with a fallback
category(cat)                                 // default categories translate, custom ones do not
```

Plural forms follow `Intl.PluralRules`. English, German, Spanish, French, Italian and Dutch need
`.one` and `.other`; Ukrainian and Polish also need `.few` and `.many`.

## 🕒 Dates, numbers and money

`setFormatLocale()` pushes the active locale into `lib/date.ts` and `lib/money.ts`, which use
`Intl.DateTimeFormat` and `Intl.NumberFormat`. Month names, weekday names, decimal separators and
compact notation all follow the language without any translated strings.

## 🍪 How the language is chosen

1. `settings.locale` from the account, once the state has loaded (`LocaleBridge`).
2. The `ft-locale` cookie, read by the server on the first render.
3. `Accept-Language`, matched against the supported list.
4. English.

Changing the language in Settings writes both the account setting and the cookie, so the sign-in page
greets you in the right language before any data is loaded.

## ➕ Adding a language

1. Add the locale to `src/lib/i18n/locales.ts` (code, native name, English name, country for the
   flag, `Intl` tag).
2. Copy `dict/en.ts` to `dict/<code>.ts` and translate every value; keep the keys untouched.
3. Add the plural forms your language needs.
4. Register it in `src/lib/i18n/index.tsx`.
5. Run `npx tsc --noEmit` and the dictionary validator described in
   [Quality checks](./quality-checks.md).

> [!TIP]
> Write for the interface, not for a dictionary: short labels, no trailing full stops in buttons,
> sentence case for hints, and the same terminology as the rest of the app.

> [!WARNING]
> Never abbreviate product terms in translations ("cryptocurrency", not slang). The app is used in
> eight languages and shortened jargon reads badly in most of them.
