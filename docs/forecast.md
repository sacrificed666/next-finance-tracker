# 🔮 Forecast

The Forecast page projects what you own month by month, up to 40 years ahead, and asks what it takes
to reach a figure. Everything is computed in the browser from the saved state; nothing on the page is
stored except planned events and the wishlist.

## 📐 What the projection counts

`buildProjection` in `lib/finance/finmath.ts` starts from today's balances and steps one month at a
time:

| Part | How it moves |
| --- | --- |
| Accounts | Today's balances, growing by the **return on savings** set on the page, compounded monthly |
| Investments | Each position valued on the same day of every future month the way the Investments page values it today — accrual, coupons, dividends, top-ups |
| Payouts | Interest, coupons and dividends an investment pays out land in the accounts in the month they are paid |
| Planned events | One-off amounts in a given month: a purchase subtracts, a windfall adds |
| Wishlist | Items given a month join the events as planned purchases |
| Debts | With **Subtract debts** on, each balance shrinks by its monthly payment and the chart shows net worth |

> [!NOTE]
> The projection does not add what you keep each month from income over spending. The money you save
> in future months appears only through planned events and investment top-ups.

## 🎚️ Assumptions

| Control | Range | Default |
| --- | --- | --- |
| Horizon | 1 to 40 years | 10 years |
| Return on savings | 0 to 25 % a year, in half-percent steps | 0 % |
| Scenario spread | 0 to 10 points | 3 points |
| Show in today's money | On or off | Off |
| Subtract debts | On or off | On when there are debts |

**Cautious** and **optimistic** runs use the return minus and plus the spread (never below zero).
They differ only where a return applies, so with a zero return the hero shows one figure, not a range.

**Today's money** deflates every point by inflation weighted by what you hold: 10 % a year for
hryvnias, 3 % for dollars and 2.5 % for euros (`INFLATION_PCT` in `use-forecast.ts`), each weighed by
its share of your holdings in the base currency.

The controls answer at once; the projection and every card built on it follow through
`useDeferredValue`, so dragging a slider never waits for the yearly table.

## 🏁 Independence

The page marks the month the projected total could pay for your average monthly spending — over the
last six months that had any — withdrawing 4 % a year (`SAFE_WITHDRAWAL_PCT`). The hero also shows how
much of that spending the total covers today.

## 🎯 Reach a goal

Enter an amount, a currency and a month. The card shows when the projection reaches the amount and,
if the month comes first, how much more to put aside each month to close the gap — compounded at the
same return on savings.

## 🛍️ Wishlist

Items are ordered by priority, then price. Each gets the month it becomes affordable if what you keep
on average goes towards the list, one item after another. That pace is the average net result of the
last six months that had any income or spending.

> [!TIP]
> Planned events made in older versions lived in the browser. They are moved into the saved data the
> first time the page opens (`legacy-events.ts`), and the browser copy is removed.
