# 🧾 Taxes

Ukrainian sole proprietors ("ФОП") pay a fixed cocktail of single tax, military levy and social
contribution, and the mix depends on the group. The app models this per income entry, not globally.

## 🗂️ Supported regimes

`src/lib/tax.ts` defines every regime with the 2026 reference numbers
(`MINIMUM_WAGE_UAH = 8 647`, `LIVING_MINIMUM_UAH = 3 328`, `ESV_MIN_UAH = 1 902.34`).

| Regime | What is deducted | Annual income limit |
| --- | --- | --- |
| `none` | Nothing — the income is recorded as received | — |
| `fop1` | Fixed single tax ₴332.80 + military levy ₴864.70 + social contribution ₴1 902.34 per month | ≈ ₴1.44M |
| `fop2` | Fixed single tax ₴1 729.40 + levy ₴864.70 + contribution ₴1 902.34 per month | ≈ ₴7.21M |
| `fop3` | 5% single tax + 1% military levy on income, plus ₴1 902.34 per month | ≈ ₴10.09M |
| `fop3vat` | 20% VAT out of the gross first, then 3% + 1%, plus ₴1 902.34 per month | ≈ ₴10.09M |
| `fop4` | Land-based single tax is paid separately; only levy + contribution here | — |
| `general` | 18% personal income tax + 5% levy + 22% social contribution | — |
| `custom` | Your own rate, fixed deduction, VAT and label | — |

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
| Expenses → categories | The default category tree includes a "Taxes" parent |

The annual limit card watches the regime of your latest taxed income and turns amber above 90% of
the limit.

> [!TIP]
> There is no global tax switch in Settings. The app remembers the regime you used last and offers
> it for the next income — that is `settings.tax`, updated quietly when you save a new entry.

## ⚠️ What this is not

> [!CAUTION]
> These numbers are a planning aid, not tax advice or a declaration. Rates, minimum wage and the
> social contribution change by law — check `src/lib/tax.ts` at the start of every year and update
> the constants in one place.
