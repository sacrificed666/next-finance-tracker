# 🎨 Design system

## 🧊 Surfaces

Tailwind v4 with CSS custom properties, written in **Sass**. `src/app/globals.scss` is the entry —
it pulls in Tailwind and the partials in `src/styles/`:

| File | Holds |
| --- | --- |
| `_lib.scss` | `$ease`, the `hover`, `card-shadow` and `rim` mixins — no CSS of its own |
| `_tokens.scss` | Light and dark custom properties, the series palettes and the `@theme inline` map |
| `_typography.scss` | `.num-*`, `.page-title`, `.label`, `.caption`, `.card-title` |
| `_base.scss` | Element defaults: focus rings, inputs, the range slider, scrollbars |
| `_backdrop.scss` | `.app-backdrop` and the two glows behind every page |
| `_surfaces.scss` | `.glass`, `.glass-strong`, `.glass-solid`, `.glass-el`, `.glass-well`, `.btn-gradient`, `.icon-btn` |
| `_charts.scss` | Chart entry animations |
| `_motion.scss` | `rise`, the stagger ladder, sheet and overlay animations |
| `_preferences.scss` | `prefers-reduced-transparency`, `prefers-reduced-motion` |
| `_print.scss` | Printing: no backdrop, plain white cards with a hairline border, cards kept whole across pages |

A printed page drops the sidebar and the phone bars (`print:hidden`) and always uses the light
theme: `PrintTheme` (`components/providers/print-theme.tsx`) switches `data-theme` for as long as
the page prints and restores it afterwards. Controls that mean nothing on paper, such as the period
switch on Reports, carry `print:hidden` too.

Three glass levels plus wells:

| Class | Use |
| --- | --- |
| `.glass` | Cards (`Card`) |
| `.glass-strong` | Floating surfaces the page scrolls under: dropdowns, the mobile bars, the toast |
| `.glass-solid` | Dialogs, the command palette and chart tooltips — the same look, nearly opaque, no backdrop blur |
| `.glass-el` | Inputs, buttons, chips |
| `.glass-well` | Inset areas inside a card |

Colour tokens come in pairs for light and dark (`--ink-1`, `--card`, `--hairline`, `--accent`,
`--income`, `--expense`, `--warning`, `--series-1…14`). Charts and category icons pick a `series`
slot, so every hue is theme-aware.

> [!CAUTION]
> Unlayered CSS beats every Tailwind utility, because utilities live in `@layer utilities`. Shared
> positioning declarations therefore sit inside `@layer components` — otherwise `.glass-strong` would
> pin a `fixed` navigation bar back to `relative` and dropdowns would push the page around. If you
> add a rule that sets `position`, put it in that layer.

## 🧱 Building blocks

`src/components/ui/` holds the kit, one file per family, all re-exported from
`@/components/ui`:

| File | Components |
| --- | --- |
| `card.tsx` | `PageHeader`, `Card` (with `glow`), `CardLink`, `IconDisc`, `EmptyState` |
| `button.tsx` | `Button`, `AddButton`, `LinkButton` |
| `form.tsx` | `Field`, `FieldSet`, `TextInput`, `TextArea`, `Select`, `MonthInput` |
| `choice.tsx` | `SegmentedControl`, `OptionChips`, `FilterPills`, `Switch`, `Slider` |
| `toolbar.tsx` | `Toolbar`, `ToolbarSlot`, `SearchInput`, `SortSelect` |
| `feedback.tsx` | `Badge`, `Callout`, `ProgressMeter`, `Toast` |
| `facts.tsx` | `Facts`, `Fact` |
| `summary.tsx` | `SummaryPanel`, `Unit` |
| `money.tsx` | `Money`, `TripleMoney`, `CurrencyCells` |
| `logo.tsx` | `RemoteLogo`, `Monogram` |
| `overlay.tsx` | `Sheet` (with `wide` for previews), `ConfirmDialog`; the scroll lock, focus trap and dialog stack hooks the command palette reuses |
| `icon.tsx` | `Icon`, `SUBJECT_SLOT` |

Charts live in `src/components/charts/` (`HeroTrend`, `HeroSplit`, `MonthlyColumns`, `PaceLines`,
`BalanceLine`, `Donut`, `CategoryBreakdown`, `StackedArea`, `Sparkline`), pickers and composite inputs
in `src/components/forms/` (`OptionPicker`, `TagInput`, `ReceiptPhotos`, the language picker).
`MonthlyColumns` draws income and expenses side by side, or income alone with any tax stacked on top;
`PaceLines` draws a month's running total against the month before; `BalanceLine` draws a projected
balance day by day with the zero line and its lowest point marked (Dashboard → cash ahead).

## 🔍 Toolbars: search, filters, sorting

```tsx
<Toolbar>
  <SearchInput value={query} onChange={setQuery} placeholder={t("tx.search")} />
  <SegmentedControl … className="flex-[1_0_auto] sm:flex-none" />
</Toolbar>
<Toolbar>
  <ToolbarSlot><Select size="sm" …/></ToolbarSlot>
  <SortSelect value={sort} onChange={setSort} options={…} direction={dir} onDirectionChange={setDir} />
</Toolbar>
```

- `Toolbar` is a wrapping flex row; every child declares a flex basis instead of a fixed width.
- `SearchInput` grows aggressively (`flex-[999_1_14rem]`), selects sit at `10rem`, `SortSelect` at
  `11rem`, so rows re-flow predictably from 390 px to 1440 px.
- `FilterPills` wraps instead of scrolling horizontally.
- View preferences (sort key, direction) persist per list through `usePersistentState`.

> [!WARNING]
> A `<select>` is as wide as its longest option unless it can shrink. Every select wrapper carries
> `min-w-0`, and so do grid and flex columns that contain one. Forgetting that is what made whole
> pages scroll sideways on phones.

## 🗂️ One page skeleton

Every page is built from the same pieces, so the same kind of block sits in the same place wherever
you are:

```tsx
<PageHeader title=… subtitle=… action=… />
<PageBody>
  <PageHero                          {/* components/layout/hero.tsx — full width, always first */}
    label=… icon=… action=…          {/* action: controls that change what it shows (month switcher) */}
    value=… sub=… delta=… note=…     {/* the headline figure, the same figure another way, how it moved */}
    aside={<HeroTrend … /> | <HeroSplit … />}
    stats={[…]}                      {/* three or four figures that explain the headline */}
  />
  <Split
    main={<>charts, lists, tables</>}
    side={<>summaries, breakdowns, controls</>}
  />
  {/* optional full-width block: yearly table, profile details */}
</PageBody>
```

| Page | Hero headline | Hero picture | Hero figures |
| --- | --- | --- | --- |
| Dashboard | Net worth, in every currency | 12-month trend (daily snapshots where recorded), or what it is made of while flat | Income, expenses, net flow, savings rate |
| Calendar | The month's net, with a month switcher | — | Still to go out, still to come in, taxes due, busiest day |
| Reports | The period's net, with arrows to step between periods | Where the money went, by category | Income, expenses, savings rate, per day — each against the period before |
| Expenses | The month's spending, with a month switcher | Spending over 12 months | Income, net, per day, budget left |
| Income | This month | Income over 12 months | 6-month average, year to date, tax, planned |
| Accounts | Money in accounts | Split by account type | Net worth, emergency fund, savings goals, debts |
| Investments | Current value | Expected value over the next 12 months | Invested, earned, next 12 months |
| Forecast | Base scenario at the horizon | Where the end figure comes from | Now, cautious, optimistic, independence |
| Profile | Avatar, name and details | Level, progress and XP sources | Health, achievements, weekly streak, months in the plus |
| Settings | Records in the database | Exchange rates | Accounts, investments, categories, subscriptions |

Below the hero:

| Page | Main column | Side column |
| --- | --- | --- |
| Dashboard | Quick add, cash flow, spending by category (with every budget), cash ahead | Largest holdings, subscriptions, currencies, progress |
| Calendar | The month grid | The chosen day, key dates |
| Reports | Categories compared, category trends | Biggest changes, largest expenses, by tag, year in review |
| Expenses | Where it went + spending pace, ledger, recurring | Budgets, subscriptions |
| Income | Income by month (tax stacked on top), by quarter, all income | Income limit, tax calendar, sources (by source or currency) |
| Accounts | Accounts (empty ones folded) | Currencies, savings goals, debts, money owed to you |
| Investments | Positions — cards or a returns table | Allocation, schedule |
| Forecast | Assumptions, projection · year-by-year table across the width | Reach a goal, planned events, wishlist |
| Profile | Achievements, your numbers · details across the width | Financial health, sign-in |
| Settings | Categories, bank import, auto-categorisation, data | General, exchange rates, about |

- **`PageHero`** — the one `glow` block per page. The headline uses `.hero-number`, the figures
  underneath are `bg-ghost` cells like every other inner tile; a figure with `href` links to its page.
  Three figures put the last one across the full row on phones.
- **`HeroTrend` / `HeroSplit`** (`components/charts/hero-visuals.tsx`) — the right half of the hero:
  a labelled area trend, or a split bar with a legend. A three-part split stacks each legend entry.
- **`Split`** — main column 8/12, side column 4/12 from `xl`. Each column is its own stack, so cards
  of different heights never leave holes; below `xl` the side cards pair up two per row. `stickySide`
  keeps a short side column in view beside a long list (Income, Accounts, Investments); `sideFirst`
  puts the side column first on phones when it holds the controls (Settings).
- **`Pair`** — two cards side by side inside a column.
- **Nothing is shown twice on one page.** A card below the hero never repeats the hero's figures, and
  two cards never show the same list: the scenarios and "where it comes from" live only in the
  Forecast hero, account types only in the Accounts hero, the Dashboard's budgets only inside its
  spending card, an investment's returns only in the positions card (as a table or as cards).
- **Empty is not shown.** A tile with nothing in it is left out rather than showing "—", a card with
  a single row folds into its neighbour (Income's currencies join its sources), and zero-balance
  accounts fold into one "show" row.

## 📋 Lists and tables

Every list and table shares one look, defined once in `styles/_surfaces.scss`:

| Class | Where | What it does |
| --- | --- | --- |
| `.rows` | A list's wrapper (`ul`, `div`) | Rounded rows 2 px apart, a faint stripe on every other one |
| `.rows-head` | The column header above a `.rows` list | A rounded bar with small uppercase labels |
| `.group-head` | A day or month heading inside a list | A rounded bar: label on the left, the group's total on the right |
| `.total-row` | The sum under a list | A green-tinted rounded bar (debts use a red tint) |
| `.data-table` | A real `<table>` | The same rounded rows via `border-spacing`, header bar in `thead`, tinted `tfoot`; figures never wrap |
| `.table-scroll` | Around a `.data-table` that may be wider than a phone | Scrolls sideways only; any `overflow-x` makes the other axis scroll too, and the table's negative margins would otherwise show as a stray vertical scrollbar |

- No hairline dividers between rows: the stripe and the gap separate them. A tappable row adds
  `.row-tap`, whose hover fill has the same radius.
- A list card opens with a **`SummaryPanel`** (`components/ui/summary.tsx`) — a rounded `bg-ghost`
  block with the headline figure, what it is measured against, and a meter or caption underneath —
  before its filters (Spending, Budgets, Subscriptions, Recurring, Savings goals, Cash ahead, Sources).
  A unit sits beside its figure through `Unit` ("/mo").
- A record's key facts are `Facts` / `Fact` tiles (`components/ui/facts.tsx`), two per row, with the
  long one across the full row — not a bordered key/value table.
- A list that acts on several rows at once has a **select mode** (the ledger's **Select**): rows
  become checkboxes, and a `.glass-solid` bar pinned to the bottom of the card holds the count, select
  all and the actions. The bar sits above the phone tab bar and stacks its controls on phones.

## 📐 Layout rules

- Page shells use `grid` with `items-start`; columns that hold cards get `min-w-0`.
- Lists of cards with uneven heights (investment positions) use CSS columns with
  `break-inside-avoid` rather than a row grid.
- `Card` is `flex min-w-0 flex-col`, so long content truncates instead of stretching the grid.
- Currency tables use `.currency-row` with `--currency-cols`, so the number of columns follows
  `displayCurrencies(state)`.
- Sheets are full-height on phones and centred dialogs from `sm` upwards.
- Bottom navigation is fixed on phones; the sidebar is sticky from `md` upwards.

## 🖼️ Logos and marks

`RemoteLogo` takes an ordered list of sources, falls back through them on error, ignores images under
24 px and finally renders whatever fallback you pass (`Monogram`, an emoji or an icon). Brand and
game logos are self-hosted first, remote favicon providers second.

## ♿ Accessibility habits

- Every icon-only control has an `aria-label`; decorative marks are `aria-hidden`.
- Segmented controls and pill groups are radio groups with arrow-key navigation.
- Focus rings use `focus-visible` and the accent colour.
- Colour is never the only signal: badges carry text, progress bars carry numbers.

> [!TIP]
> When adding a screen, copy the structure of an existing feature folder: a `<page>-page.tsx` with
> `PageHeader` and a `stagger` grid, one file per `Card`, toolbars inside the card they filter, and
> one file per editing `Sheet`, mounted with a `key` so it always opens with a fresh form.

## 🧪 Why the glass is measured, not styled

Panes sit at 66% opacity in light and 62% in dark. That floor is where every ink still clears 4.5:1
through *both* panes it can end up behind — the card, and a control sitting on that card — over every
backdrop extreme and under the specular highlight. Four things moved to get there, each because a
measurement said so:

- The **backdrop** grew from two smooth gradients to three wash fields, a ruled grid, two glows
  and a frost grain. Translucency needs something to reveal: over a flat page a 62% pane looks
  exactly like a 100% one, and a straight line seen through frosted glass is what the eye reads as
  glass.
- The **dark sheen** dropped to 4%. A white specular is precisely what lightens a dark pane out of
  contrast range; it was the binding constraint, not the opacity.
- **`--ink-3`** and the light **`--accent`** each stepped once. Both were sitting exactly on the WCAG
  minimum with nothing to give.
- Controls got the same material as a **1 px lit edge rather than a gradient wash** — the wash cost
  1.6:1 of contrast where it overlapped the card's own sheen. Hover brightens that edge; only
  controls carrying strong ink also step their fill.

Each pane carries a masked gradient rim, so the edge facing the light catches it and the far edge
falls into shadow, plus an under-edge that gives it thickness. `prefers-reduced-transparency` turns
the whole thing solid.

> [!NOTE]
> Content cards deliberately carry **no `backdrop-filter`**: behind them is a smooth gradient, and
> blurring a smooth gradient returns very nearly the same gradient — fourteen full-screen filters a
> frame for a difference you cannot see. The mobile bars and dropdowns keep theirs, where the page
> really does scroll past underneath.

## ⚡ What the look is allowed to cost

Measured with a 4× slower CPU (a mid-range phone), these are the rules the surfaces follow:

- **Nothing on the page moves by itself.** The two glows used to drift; a full-screen layer changing
  every frame kept the GPU busy on an idle page and forced every blurred bar above it to be redrawn.
  Holding them still halved the GPU work while scrolling on a phone.
- **A blur never sits under something that changes.** A dialog someone types into, the command
  palette and a tooltip that follows the pointer use `.glass-solid`, and the dim behind a dialog is
  plain `bg-black/50`. With the two stacked blurs the palette took up to ~90 ms a keystroke; without
  them, one frame.
- **Entrance animations play once.** Cards rise and charts grow on the first screen after a load;
  `:root[data-entered]` (set 1.3 s after the data arrives) switches them off, so another page or
  another month is drawn at once instead of repainting SVG for a second.
- **Controls answer before the cards.** Month and period switchers, the ledger search and the
  forecast sliders update at once and pass a `useDeferredValue` copy to the heavy cards, which redraw
  in the background and are interrupted by the next click. The command palette does not: its list is
  cheap, and Enter must act on the results for what was just typed.

## 🎨 One brand colour, split by job

Spring green at OKLCH hue 156, held at the edge of the sRGB gamut so it reads fresh rather than
forest. The token is split by role:

| Token | Job |
| --- | --- |
| `--accent` | Ink — dark on a light page, bright on a dark one, always ≥ 4.5:1 |
| `--accent-fill` | Surface — never changes with the theme |
| `--on-accent` | What goes on top of that surface |
| `--income` | Same value as `--accent`: one hue, one meaning |
| `--expense`, `--warning` | Reserved status colours; never doubled as a chart series |

## 📊 Chart colour is computed, not chosen

The categorical slots avoid the green and red hue bands entirely, because in this app those two
*mean* income and overspend. The hues, their steps and their order came out of an enumeration scored
by a colour-blindness validator: worst adjacent pair ΔE 12.1 light / 10.6 dark under protanopia and
deuteranopia, 20.4 / 19.1 under normal vision.

> [!IMPORTANT]
> No eight-hue palette clears those floors across all 28 pairs, so every series is also directly
> labelled and separated by a 2 px gap — identity never rests on hue alone. Income-versus-expense
> charts use the status colours, not series slots.

## 📏 Scales instead of per-screen decisions

- **Figures** — five steps, `.num-hero` … `.num-sm`, all tabular.
- **Text** — `.label`, `.caption`, `.body-strong`, `.card-title`.
- **Rhythm** — 12 px between cards, 16 px from `sm`, in every grid on every page; cards pad 14 px,
  16 px from `sm`.
- **Controls** — 40 px inputs and buttons, 36 px for `size="sm"` inside a row; icon buttons extend
  their hit area past the visible circle.
- **Single-choice controls are real radio groups**: one tab stop for the group, arrows to move,
  `Home`/`End` to jump, focus travelling with the selection.
- **Sheets** put their actions in a footer that does not scroll, with the destructive action pinned
  to the far left.
