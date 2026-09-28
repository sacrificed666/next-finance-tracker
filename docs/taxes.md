# 🧾 Taxes

Ukrainian sole proprietors ("ФОП") pay a fixed cocktail of single tax, military levy and social
contribution, and the mix depends on the group. The app models this per income entry, not globally.

## 🗂️ Supported regimes

`src/lib/finance/tax.ts` builds every regime from the year's minimum wage and subsistence minimum.
The table shows 2026:

| Regime | What is deducted | Annual income limit |
| --- | --- | --- |
| `none` | Nothing — the income is recorded as received | — |
| `fop1` | Fixed single tax ₴332.80 + military levy ₴864.70 + social contribution ₴1 902.34 per month | ≈ ₴1.44M |
| `fop2` | Fixed single tax ₴1 729.40 + levy ₴864.70 + contribution ₴1 902.34 per month | ≈ ₴7.21M |
| `fop3` | 5% single tax + 1% military levy on income, plus ₴1 902.34 per month | ₴10 091 049 |
| `fop3vat` | 20% VAT out of the gross first, then 3% + 1%, plus ₴1 902.34 per month | ₴10 091 049 |
| `fop4` | Land-based single tax is paid separately; only levy + contribution here | — |
| `general` | 18% personal income tax + 5% levy + 22% social contribution | — |
| `custom` | Your own rate, fixed deduction, VAT and label | — |

## 📆 Figures per year

Every fixed amount and limit follows from two numbers the State Budget law sets each year, kept in
`TAX_YEARS`:

| Year | Minimum wage | Subsistence minimum | ЄСВ minimum | Group 1 | Group 2 | Group 3 limit |
| --- | --- | --- | --- | --- | --- | --- |
| 2025 | ₴8 000 | ₴3 028 | ₴1 760 | ₴302.80 | ₴1 600 | ₴9 336 000 |
| 2026 | ₴8 647 | ₴3 328 | ₴1 902.34 | ₴332.80 | ₴1 729.40 | ₴10 091 049 |

- ЄСВ is 22% of the minimum wage; group 1 pays 10% of the subsistence minimum, group 2 20% of the
  minimum wage; the military levy of groups 1, 2 and 4 is 10% of the minimum wage.
- The limits are 167, 834 and 1 167 minimum wages for groups 1, 2 and 3.
- `taxRegime(id, year)` and `esvMinimum(year)` read the year asked for, so the calendar, the limit
  card and the quarterly summary each use their own year's figures.

> [!IMPORTANT]
> Add a row to `TAX_YEARS` every January. Until then the latest known year stands in, and the tax
> cards say so in amber.

> [!NOTE]
> Group 1 and 2 pay fixed amounts *per month*, not per payment. The app deducts the fixed part from
> each taxed entry, so if you record several incomes in one month you will over-deduct — a hint in
> the income form says exactly that.

## 🧮 How a taxed income is computed

`taxBreakdown(gross, currency, profile, settings)` returns every line the UI shows:

```text
vat          = gross − gross / (1 + vatPct/100)      VAT is inside the gross
taxable      = gross − vat
percentPart  = taxable × ratePct/100
fixedPart    = fixedUAH converted into the income currency
total        = vat + percentPart + fixedPart
net          = gross − total
effectivePct = total / gross × 100
```

The saved transaction stores the **net** amount, plus a `tax` object with the gross, the rate, the
fixed part, the VAT share, the regime id and an optional label. That way old entries keep the rules
that applied when they were recorded, even if you change regimes later.

> [!IMPORTANT]
> Editing an old income re-applies the regime currently selected in that form. Change the regime
> only if the entry really was taxed differently.

## 🧭 Where taxes appear

| Screen | What you see |
| --- | --- |
| Income → Add / Edit | Regime picker, live breakdown, custom fields for `custom` |
| Income → stat tiles | Tax paid this year, effective rate, number of taxed entries |
| Income → limit card | Gross taxed income this year against the group's annual limit |
| Income → tax calendar | The next declarations and payments with their deadlines; tick one off once paid |
| Income → by quarter | Income, tax and ЄСВ per quarter, foreign income at the NBU rate of its day |
| Calendar | Every deadline on its day |
| Expenses → categories | The default category tree includes a "Taxes" parent |

The annual limit card watches the regime of your latest taxed income and turns amber above 90% of
the limit.

> [!TIP]
> There is no global tax switch in Settings. The app remembers the regime you used last and offers
> it for the next income — that is `settings.tax`, updated quietly when you save a new entry.

## 📅 The tax calendar

`lib/finance/tax-calendar.ts` builds a year's obligations from the regime of your taxed income
(FOP groups 1, 2, 3 and 3 + VAT). A deadline that falls on a weekend moves to the Monday.

| Obligation | Group 3, 3 + VAT | Groups 1 and 2 |
| --- | --- | --- |
| Declaration | Quarterly, 40 days after the quarter | Yearly, 60 days after the year |
| Single tax and military levy | Quarterly, 50 days after the quarter | Monthly, by the 20th |
| ЄСВ | Quarterly, by the 20th after the quarter (3 × the minimum) | The same |
| VAT (3 + VAT only) | Monthly declaration by the 20th, payment ten days later | — |

Marking an item paid stores the day in `settings.taxPaid` and books the payment as an expense in the
taxes category, with the id `tax:<obligation>`; unmarking removes it again. When the bank payment is
imported later, it takes that entry's place instead of doubling it. The side card shows what is
unpaid, including anything overdue by up to 45 days.

## 📒 The income book and the declaration

The quarterly card carries what the paperwork asks for:

| Piece | What it holds |
| --- | --- |
| **Income book (CSV)** | Every taxed receipt of the year, oldest first: the date, the income in hryvnias at the NBU rate of its day (without VAT for a VAT payer), the description, the original amount, currency and rate, and a total. `;`-separated with decimal commas and a byte-order mark, so Ukrainian Excel opens it as is; the columns are named in Ukrainian whatever the app's language |
| **For the declaration** | For the last quarter that has ended, group 3: income since 1 January, single tax and military levy since 1 January, and what this quarter adds after the earlier quarters |

`incomeBook`, `incomeBookCsv` and `declarationFigures` in `lib/finance/tax-calendar.ts` build them.

## ⚠️ What this is not

> [!CAUTION]
> These numbers are a planning aid, not tax advice or a declaration. Rates, the minimum wage and the
> social contribution change by law — check `TAX_YEARS` in `src/lib/finance/tax.ts` at the start of
> every year.
