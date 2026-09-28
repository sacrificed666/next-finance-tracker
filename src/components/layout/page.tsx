import type { ReactNode } from "react";

/*
 * Every page follows one skeleton, so the same kind of block always sits in the
 * same place:
 *
 *   PageHeader            title, subtitle, primary actions
 *   PageHero              full width: the headline figure, its trend or split,
 *                         and the figures that explain it (layout/hero.tsx)
 *   Split                 main column (8/12): charts, lists, tables
 *                         side column (4/12): summaries, breakdowns, controls
 *   [full-width block]    wide detail that needs the whole row
 */

const GAP = "gap-3 sm:gap-4";

/** Vertical rhythm between the page's sections, with the entry animation. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="stagger space-y-3 sm:space-y-4">{children}</div>;
}

/**
 * Main and side columns. Each column is its own stack, so cards of different
 * heights never leave holes. Below `xl` the side cards pair up two per row.
 */
export function Split({
  main,
  side,
  sideFirst = false,
  stickySide = false,
}: {
  main: ReactNode;
  side: ReactNode;
  /** On narrow screens show the side column first — for controls that shape the main content. */
  sideFirst?: boolean;
  /** Keep the side column in view while a long main column scrolls. */
  stickySide?: boolean;
}) {
  return (
    <div className={`grid items-start ${GAP} xl:grid-cols-12`}>
      <div className={`flex min-w-0 flex-col ${GAP} xl:col-span-8 ${sideFirst ? "order-2 xl:order-1" : ""}`}>{main}</div>
      <div
        className={`grid min-w-0 items-start ${GAP} md:grid-cols-2 xl:col-span-4 xl:grid-cols-1 ${
          sideFirst ? "order-1 xl:order-2" : ""
        } ${stickySide ? "xl:sticky xl:top-6" : ""}`}
      >
        {side}
      </div>
    </div>
  );
}

/** Two cards side by side inside a column, from `md`. */
export function Pair({ children }: { children: ReactNode }) {
  return <div className={`grid items-start ${GAP} md:grid-cols-2`}>{children}</div>;
}
