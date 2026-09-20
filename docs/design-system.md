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
| `_backdrop.scss` | `.app-backdrop`, the drifting orbs and their keyframes |
| `_surfaces.scss` | `.glass`, `.glass-strong`, `.glass-el`, `.glass-well`, `.btn-gradient`, `.icon-btn` |
| `_charts.scss` | Chart entry animations |
| `_motion.scss` | `rise`, the stagger ladder, sheet and overlay animations |
| `_preferences.scss` | `prefers-reduced-transparency`, `prefers-reduced-motion` |

Three glass levels plus wells:

| Class | Use |
| --- | --- |
| `.glass` | Cards (`GlassCard`) |
| `.glass-strong` | Floating surfaces: sheets, dropdowns, the mobile navigation bar |
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

`src/components/ui.tsx` holds the kit: `GlassCard`, `Button`, `Field`, `FieldSet`, `TextInput`,
`TextArea`, `Select`, `SegmentedControl`, `OptionChips`, `Switch`, `Sheet`, `ConfirmDialog`,
`ProgressMeter`, `Badge`, `Callout`, `EmptyState`, `Money`, `TripleMoney`, `CurrencyCells`,
`RemoteLogo`, `Monogram`, `MonthInput`, plus the listing controls below.

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

## 📐 Layout rules

- Page shells use `grid` with `items-start`; columns that hold cards get `min-w-0`.
- `GlassCard` is `flex min-w-0 flex-col`, so long content truncates instead of stretching the grid.
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
> When adding a screen, copy the structure of an existing page: `PageHeader`, a `stagger` grid of
> `GlassCard`s, toolbars inside the card they filter, and `Sheet` for editing.

## 🧪 Why the glass is measured, not styled

Panes sit at 66% opacity in light and 62% in dark. That floor is where every ink still clears 4.5:1
through *both* panes it can end up behind — the card, and a control sitting on that card — over every
backdrop extreme and under the specular highlight. Four things moved to get there, each because a
measurement said so:

- The **backdrop** grew from two smooth gradients to three wash fields, a ruled grid, two drifting
  orbs and a frost grain. Translucency needs something to reveal: over a flat page a 62% pane looks
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
> frame for a difference you cannot see. The chrome and the overlays keep theirs, where the page
> really does scroll past underneath.

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
- **Rhythm** — 16 px between cards, 20 px from `sm`, in every grid on every page.
- **Controls** — one 44 px touch floor, with an explicit `size="sm"` for actions inside a row.
- **Single-choice controls are real radio groups**: one tab stop for the group, arrows to move,
  `Home`/`End` to jump, focus travelling with the selection.
- **Sheets** put their actions in a footer that does not scroll, with the destructive action pinned
  to the far left.
