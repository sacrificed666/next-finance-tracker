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

## 🔁 Recurring rules

A recurring rule posts one transaction each month on a chosen day, between `startMonth` and an
optional `endMonth`. The store materialises them after every load, so the ledger always contains
real entries you can edit or delete individually.

| View | Meaning |
| --- | --- |
| Active | Runs in the month you are looking at |
| Ended | Its last month has passed |
| All | Everything, including future rules |

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

> [!IMPORTANT]
> Stopping a subscription means setting the month it stopped, not flipping a switch. The sheet has an
> **End with \<month\>** button that fills the "Until" field with the current month, which keeps
> history intact: past months still show what you paid.

> [!NOTE]
> Subscriptions created in an older version could be switched off. Those show a **Paused** badge and
> a **Resume** button in the sheet, so old data still behaves predictably.

## 🧮 How they reach the ledger

1. `syncSchedule` rewrites future postings when you edit a rule or subscription.
2. `materializeRecurring` runs after every state load and inserts anything due up to today.
3. Generated transactions carry `recurringId` or `subscriptionId`, which is why they do not count as
   "logged by hand" in the [gamification](./gamification.md) XP.

> [!WARNING]
> Deleting a rule or subscription also removes its future postings, but keeps everything already
> posted — the past is history, not a projection.
