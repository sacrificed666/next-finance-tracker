"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { Button, Toast } from "./ui";
import { Icon } from "./icons";
import { MobileTopBar, Sidebar, TabBar } from "./nav";

/**
 * App chrome + hydration gate: pages are prerendered without localStorage
 * data, so their content renders only after the store hydrates on the
 * client — the skeleton is what both server and first client render show.
 * Desktop chrome is a fixed glass rail on the left; content is inset past it.
 * On mobile the rail collapses to a slim top bar plus a bottom tab bar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { hydrated, loadError, reload, sync, undoLabel, undo, dismissUndo } = useStore();
  const conflict = sync === "conflict";
  const pathname = usePathname();

  /*
   * The card cascade is a welcome, and it should happen once. Client-side
   * routing remounts the whole page, so it was replaying on every tab switch —
   * fourteen staggered card entrances standing between you and the numbers,
   * four or five times a session. `data-entered` on <html> is what the CSS
   * checks (see globals.css); it is set after the first page has finished
   * arriving and never cleared.
   */
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(
      () => document.documentElement.setAttribute("data-entered", ""),
      900,
    );
    return () => clearTimeout(id);
  }, [hydrated]);

  return (
    <>
      <div className="app-backdrop" aria-hidden />
      {/* the second drifting field; its own element rather than a third
          pseudo on the backdrop, which is already carrying the first orb
          and the frost grain */}
      <div className="orb-b" aria-hidden />
      <Sidebar />
      <div className="md:pl-64">
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8">
          <MobileTopBar />
          <main className="min-w-0">
            {!hydrated ? (
              <Skeleton dashboard={pathname === "/"} />
            ) : loadError ? (
              <DatabaseError message={loadError} onRetry={reload} />
            ) : (
              children
            )}
          </main>
        </div>
      </div>
      <TabBar />
      {/* a stale tab takes priority over any undo offer: nothing it does is
          being saved, and that is the more urgent thing to say */}
      {conflict ? (
        <Toast
          message="Saved elsewhere — this tab is out of date"
          actionLabel="Reload"
          onAction={() => void reload()}
          // no onDismiss: it stays until reloaded, because hiding it would hide
          // the reason nothing on this page is being saved any more
        />
      ) : (
        undoLabel && (
          <Toast
            message={undoLabel}
            actionLabel="Undo"
            onAction={undo}
            onDismiss={dismissUndo}
          />
        )
      )}
    </>
  );
}

function DatabaseError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="glass glow mx-auto max-w-xl rounded-card p-6 text-center sm:p-8">
      <span
        aria-hidden
        className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-ghost text-ink-3"
      >
        <Icon name="plug" size={24} />
      </span>
      <h1 className="text-lg font-bold text-ink-1">Database unavailable</h1>
      <p className="mt-2 text-sm text-ink-2">
        The app could not load your data from Postgres. Check that the database
        container is running and that <code className="text-ink-1">DATABASE_URL</code> is
        set.
      </p>
      <p className="mt-3 wrap-break-word rounded-field bg-ghost px-3 py-2 text-xs text-ink-3">
        {message}
      </p>
      {/* the app's own button, not a fourth hand-rolled copy of its styling */}
      <Button className="mt-5" onClick={onRetry}>
        Try again
      </Button>
    </section>
  );
}

/**
 * Stands in while the dataset loads, on the grid the arriving page actually
 * uses. A skeleton whose blocks land somewhere else makes the content look like
 * it jumped when it appears — which is precisely what the dashboard's 2/6/12
 * grid did on the five pages that are not the dashboard. Those share one shape:
 * a header, a row of stat tiles, then full-width cards.
 */
function Skeleton({ dashboard }: { dashboard: boolean }) {
  return (
    <div className="space-y-4 sm:space-y-5" aria-label="Loading…" role="status">
      <div className="glass h-9 w-52 animate-pulse rounded-card" />
      {dashboard ? (
        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-6 xl:grid-cols-12">
          <div className="glass col-span-2 h-72 animate-pulse rounded-card lg:col-span-6 xl:col-span-4 xl:row-span-2" />
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="glass h-31 animate-pulse rounded-card lg:col-span-3 xl:col-span-2"
              style={{ animationDelay: `${i * 90}ms` }}
            />
          ))}
          <div className="glass col-span-2 h-64 animate-pulse rounded-card lg:col-span-6 xl:col-span-8" />
          <div className="glass col-span-2 h-72 animate-pulse rounded-card lg:col-span-6 xl:col-span-4" />
          <div className="glass col-span-2 h-72 animate-pulse rounded-card lg:col-span-3 xl:col-span-4" />
          <div className="glass col-span-2 h-72 animate-pulse rounded-card lg:col-span-3 xl:col-span-4" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="glass h-31 animate-pulse rounded-card last:col-span-2 last:md:col-span-1"
                style={{ animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
          <div className="glass h-64 animate-pulse rounded-card" />
          <div className="glass h-80 animate-pulse rounded-card" />
        </>
      )}
    </div>
  );
}
