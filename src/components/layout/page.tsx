import type { ReactNode } from "react";

const GAP = "gap-3 sm:gap-4";

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="stagger space-y-3 sm:space-y-4">{children}</div>;
}

export function Split({
  main,
  side,
  sideFirst = false,
  stickySide = false,
}: {
  main: ReactNode;
  side: ReactNode;
  sideFirst?: boolean;
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

export function Pair({ children }: { children: ReactNode }) {
  return <div className={`grid items-start ${GAP} md:grid-cols-2`}>{children}</div>;
}
