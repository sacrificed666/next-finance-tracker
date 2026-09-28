# 🗓️ Budgets and schedules

## 🏷️ Categories

Categories have two levels: parents and children. The defaults ship with 57 categories grouped into
housing, food, transport, health, shopping, wants, education, charity, taxes and income families.

- Charts and budgets roll children into their parent (`rollupToParents`).
- A budget on a parent counts everything spent in its children too.
- Settings → Categories shows the tree with collapsible parents, a search box, a per-row **+** to add
  a subcategory and usage counts.
- **Restore default categories** adds anything missing and links known children to their parent —
  it never renames or deletes what you already have.

> [!TIP]
> Category names you never edited are translated with the interface. Rename one and your own wording
> is kept in every language.

## 🎯 Budgets

A budget is a monthly limit for one category in one currency. The Expenses page shows progress bars
per budget, the total left for the month, and marks anything above 100%.

> [!NOTE]
> Budgets are evaluated per calendar month, including transactions in child categories and
> subscriptions posted in that month.

- **Rollover.** Turn on "Carry over what's left" and whatever the budget did not use last month is
  added to this month's limit (`budgetLimit` in `lib/finance/categories.ts`). Only one month carries
  over, so an old surplus never piles up; an overspent month carries nothing.
- **Pace.** From the third day of the current month, a budget still under its limit shows the day it
  would run out if spending carried on at this month's rate.

## 🔁 Recurring rules

A recurring rule posts one transaction each month on a chosen day, between `startMonth` and an
optional `endMonth`. The store materialises them after every load, so the ledger always contains
real entries you can edit or delete individually.

| View | Meaning |
| --- | --- |
| Active | Runs in the month you are looking at |
| Ended | Its last month has passed |
| All | Everything, including future rules |

### Plans versus payments

A rule that posts exactly its category's budget every month (Food 7 000 with a Food budget of 7 000)
is a plan booked as spending: the budget always reads 100% and real spending never shows. The
recurring card names such rules and opens a sheet to stop them from this month on
(`plansBookedAsSpending`, `stopSchedules`). Earlier months keep their entries, and bills — rent,
utilities, internet, insurance, loans, taxes and subscriptions, recognised by category id or name —
start unticked, since posting those at their budget is usually the real payment.

## 📺 Subscriptions

A subscription is a recurring service with a price, a billing day and a lifetime:

```ts
startMonth        first month it bills
endMonth?         last month it bills (empty = open-ended)
period            "monthly" | "yearly"   (yearly is posted as price / 12)
```

Status is derived, never stored twice:

| Status | Rule |
| --- | --- |
| Active | `startMonth ≤ month` and (`endMonth` empty or `≥ month`) |
| Upcoming | `startMonth > month` |
| Ended | `endMonth < month` |
| Paused | Legacy entries switched off in an older version |

The list defaults to **This month**, so services that no longer bill do not clutter the view; pills
switch to upcoming, ended or all.

### Suggested subscriptions

`suggestSubscriptions` looks for a merchant charged once a month for at least two months in a row, at
about the same amount (within 10%) and day (within four days), that no subscription names yet. Up to
three show at the top of the card; **Add** opens the sheet filled in and starting the month after the
last charge, so the charge already booked is not planned twice. Dismissed suggestions are remembered
in the browser.

> [!IMPORTANT]
> Stopping a subscription means setting the month it stopped, not flipping a switch. The sheet has an
> **End with \<month\>** button that fills the "Until" field with the current month, which keeps
> history intact: past months still show what you paid.

> [!NOTE]
> Subscriptions created in an older version could be switched off. Those show a **Paused** badge and
> a **Resume** button in the sheet, so old data still behaves predictably.

## 🧮 How they reach the ledger

1. `syncSchedule` rebuilds a schedule's postings when you edit it — every month it covers, except
   entries an import already filled in with the real payment.
2. `materializeRecurring` runs after every state load and posts every month up to twelve months
   ahead, so the calendar and the cash forecast can see what is coming.
3. Generated transactions carry `recurringId` or `subscriptionId`, which is why they do not count as
   "logged by hand" in the [gamification](./gamification.md) XP.
4. An imported payment that is the real version of a posting takes its place — see
   [Bank import](./bank-import.md#-planned-payments).

> [!WARNING]
> Deleting a rule or subscription removes every entry it posted, past and future alike — the dialog
> says how many. Payments imported from the bank stay as plain entries. To keep the history, set an
> end month instead.
