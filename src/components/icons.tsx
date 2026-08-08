/**
 * One icon language for the whole app.
 *
 * The navigation always drew itself with stroked 24×24 paths; everything else —
 * every card header, every empty state — reached for an emoji. That is two
 * icon sets in one product, and the second one is not really ours: emoji are
 * drawn by the OS, so the same card is a flat glyph on Windows and a glossy
 * 3D object on macOS, they ignore the theme entirely, and each one arrives with
 * its own palette. On a dashboard whose eight chart colours were chosen against
 * a contrast validator, nine multicoloured emoji in the card headers were
 * putting more accidental colour on the page than the data was.
 *
 * These take `currentColor`, so they inherit ink and theme like text does.
 * Emoji stay exactly where they are still the right answer: the icon a *user*
 * picks for their own category, account or subscription.
 */

const PATHS = {
  /* navigation */
  home: ["M3 10.5 12 3l9 7.5", "M5 9.5V21h5v-6h4v6h5V9.5"],
  swapArrows: ["M4 7h13m0 0-3-3m3 3-3 3", "M20 17H7m0 0 3-3m-3 3 3 3"],
  arrowDown: ["M12 3v14m0 0 5-5m-5 5-5-5", "M4 21h16"],
  wallet: [
    "M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z",
    "M4 11h16",
    "M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1",
  ],
  bars: ["M4 20V10", "M9.33 20V4", "M14.67 20v-9", "M20 20v-5"],
  gear: ["M4 7h9m4 0h3", "M4 17h3m4 0h9", "M15 7a2 2 0 1 0 0-.01", "M9 17a2 2 0 1 0 0-.01"],

  /* card headers & empty states */
  chart: ["M4 20h16", "M7.5 20v-6.5", "M12 20V6.5", "M16.5 20v-9.5"],
  trend: ["M4 16.5 9.5 11l3.5 3.5L20 7", "M15.5 7H20v4.5"],
  calendar: [
    "M4.5 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-10Z",
    "M4.5 10.5h15",
    "M8.5 3.5v3",
    "M15.5 3.5v3",
  ],
  bank: [
    "M3.5 9.5 12 4.5l8.5 5",
    "M6 10.5v7",
    "M10 10.5v7",
    "M14 10.5v7",
    "M18 10.5v7",
    "M3.5 20.5h17",
  ],
  globe: [
    "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z",
    "M3.5 12h17",
    "M12 3.5c2.2 2.4 3.3 5.2 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.2-3.3-8.5S9.8 5.9 12 3.5Z",
  ],
  device: [
    "M7.5 3.5h9a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1.5-1.5Z",
    "M10.5 17.5h3",
  ],
  bolt: ["M13 2.5 5.5 13.5h5l-.5 8 8.5-11h-5l.5-8Z"],
  receipt: [
    "M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z",
    "M9.2 8.5h5.6",
    "M9.2 12.5h5.6",
  ],
  pie: ["M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12V3.5Z"],
  exchange: [
    "M20.5 11.5A8.5 8.5 0 0 0 5.9 6.1",
    "M3.5 12.5a8.5 8.5 0 0 0 14.6 5.4",
    "M3.5 6.5v5h5",
    "M20.5 17.5v-5h-5",
  ],
  sliders: [
    "M6 20v-6",
    "M6 10V4",
    "M12 20v-8",
    "M12 8V4",
    "M18 20v-4",
    "M18 12V4",
    "M3.5 12h5",
    "M9.5 8h5",
    "M15.5 16h5",
  ],
  target: [
    "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z",
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    "M12 11.3a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4Z",
  ],
  tag: [
    "M11.6 3.5H19a1.5 1.5 0 0 1 1.5 1.5v7.4a2 2 0 0 1-.6 1.4l-6.5 6.5a2 2 0 0 1-2.8 0l-6-6a2 2 0 0 1 0-2.8l6.6-6.5a2 2 0 0 1 1.4-.5Z",
    "M16 8.4a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4Z",
  ],
  database: [
    "M12 3.5c4.1 0 7.5 1.2 7.5 2.7S16.1 8.9 12 8.9 4.5 7.7 4.5 6.2 7.9 3.5 12 3.5Z",
    "M4.5 6.2v11.6c0 1.5 3.4 2.7 7.5 2.7s7.5-1.2 7.5-2.7V6.2",
    "M4.5 12c0 1.5 3.4 2.7 7.5 2.7s7.5-1.2 7.5-2.7",
  ],
  info: [
    "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z",
    "M12 11v5.5",
    "M12 7.5a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4Z",
  ],
  repeat: [
    "M4.5 9.5a5 5 0 0 1 5-5h9m0 0-3-3m3 3-3 3",
    "M19.5 14.5a5 5 0 0 1-5 5h-9m0 0 3 3m-3-3 3-3",
  ],
  card: [
    "M3.5 8a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V8Z",
    "M3.5 10.5h17",
    "M7 14.5h3",
  ],
  /*
   * Money leaving: an arrow rising OUT of the baseline. It used to be an arrow
   * falling ONTO the baseline — which is `arrowDown`, the glyph the rail uses
   * for Income. Two icons a few pixels apart meaning opposite things, and in
   * the rail they sat two rows apart. As a pair they now oppose properly:
   * income drops into the line, spending climbs out of it.
   */
  spend: ["M12 17V3m0 0 5 5m-5-5-5 5", "M4 21h16"],
  banknote: [
    "M3.5 7.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-9Z",
    "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
    "M6.5 9.5h.01",
    "M17.5 14.5h.01",
  ],
  search: ["M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z", "M15.8 15.8l4.7 4.7"],
  sparkle: [
    "M11 3.5 12.7 8.3 17.5 10l-4.8 1.7L11 16.5 9.3 11.7 4.5 10l4.8-1.7L11 3.5Z",
    "M18 15.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z",
  ],
  plug: [
    "M9 3.5v5",
    "M15 3.5v5",
    "M6.5 8.5h11v2.8a5.5 5.5 0 0 1-11 0V8.5Z",
    "M12 16.8v3.7",
  ],
  /* a deduction taken as a share — the tax card was wearing a shop receipt */
  percent: [
    "M7 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
    "M17 14.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
    "M18.5 5.5 5.5 18.5",
  ],
  /* money resting in a cupped hand: borrowed, and owed back. Debts wore `card`,
     on a page that lists Card as one of the account kinds you can own. */
  debt: [
    "M12 4.2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    "M4 13.5a8.5 8.5 0 0 0 16 0",
  ],
  ellipsis: ["M6 12h.01", "M12 12h.01", "M18 12h.01"],
  check: ["m5 13 4 4L19 7"],
  chevronDown: ["m6 9 6 6 6-6"],
  chevronLeft: ["m14 6-6 6 6 6"],
  chevronRight: ["m10 6 6 6-6 6"],
  arrowRight: ["M5 12h13", "M13 6l6 6-6 6"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  edit: ["M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"],
  trash: [
    "M4 7h16",
    "M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7",
    "M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12",
  ],
  monitor: ["M3 4.5h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z", "M9 20.5h6", "M12 17.5v3"],
  sun: [
    "M12 7.9a4.1 4.1 0 1 0 0 8.2 4.1 4.1 0 0 0 0-8.2Z",
    "M12 2.6v2M12 19.4v2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M2.6 12h2M19.4 12h2M4.5 19.5l1.4-1.4M18.1 5.9l1.4-1.4",
  ],
  moon: ["M20.5 14.3A8.5 8.5 0 1 1 9.7 3.5a6.6 6.6 0 0 0 10.8 10.8Z"],
} as const;

export type IconName = keyof typeof PATHS;

/**
 * The colour a subject wears when it heads a card.
 *
 * Keyed on the glyph, not on the card, so the same subject is the same colour
 * everywhere it appears: Cash flow is teal on the dashboard and teal again on
 * Expenses, because it is the same chart. Picking per call site would have been
 * twenty-five independent decisions that drift the moment a card moves.
 *
 * On a card the tint is identity, not encoding — nothing reads a value off it.
 * The slots are still chosen so no two cards on the same page collide, which is
 * the only property a reader can actually perceive here.
 *
 * Deliberately partial: a glyph with no subject colour gets the plain control
 * material, which is the honest answer for one that heads nothing.
 */
export const SUBJECT_SLOT: Partial<Record<IconName, number>> = {
  chart: 1,
  spend: 2, trend: 2,
  bank: 3, sliders: 3, gear: 3,
  globe: 4, exchange: 4,
  device: 5,
  target: 6, arrowDown: 6,
  bolt: 7, card: 7,
  wallet: 8,
  pie: 9, calendar: 9, tag: 9,
  receipt: 10, percent: 10,
  repeat: 11, database: 11,
  banknote: 12, debt: 12,
  info: 1,
};

export function Icon({
  name,
  size = 18,
  /** the nav bumps this on the active item, so weight carries state as well as colour */
  strokeWidth = 1.8,
  className = "",
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
