"use client";

import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { MobileTopBar, Sidebar, TabBar } from "./nav";

/**
 * App chrome + hydration gate: pages are prerendered without localStorage
 * data, so their content renders only after the store hydrates on the
 * client — the skeleton is what both server and first client render show.
 * Desktop chrome is a fixed glass rail on the left; content is inset past it.
 * On mobile the rail collapses to a slim top bar plus a bottom tab bar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { hydrated, loadError, reload } = useStore();
  return (
    <>
      <div className="app-backdrop" aria-hidden />
      <Sidebar />
      <div className="md:pl-64">
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8">
          <MobileTopBar />
          <main className="min-w-0">
            {!hydrated ? (
              <Skeleton />
            ) : loadError ? (
              <DatabaseError message={loadError} onRetry={reload} />
            ) : (
              children
            )}
          </main>
        </div>
      </div>
      <TabBar />
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
    <section className="glass glow mx-auto max-w-xl rounded-card p-8 text-center">
      <p className="text-4xl" aria-hidden>
        🔌
      </p>
      <h1 className="mt-3 text-lg font-bold text-ink-1">Database unavailable</h1>
      <p className="mt-2 text-sm text-ink-2">
        The app could not load your data from Postgres. Check that the database
        container is running and that <code className="text-ink-1">DATABASE_URL</code> is
        set.
      </p>
      <p className="mt-3 wrap-break-word rounded-2xl bg-ghost px-3 py-2 text-xs text-ink-3">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="btn-gradient mt-5 inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold shadow-md transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.97]"
      >
        Try again
      </button>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-label="Loading…" role="status">
      <div className="glass h-9 w-52 rounded-card" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        <div className="glass h-44 rounded-card col-span-2 xl:row-span-2" />
        <div className="glass h-24 rounded-card" />
        <div className="glass h-24 rounded-card" />
        <div className="glass h-24 rounded-card" />
        <div className="glass h-24 rounded-card" />
        <div className="glass h-64 rounded-card col-span-2 xl:col-span-4" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="glass h-56 rounded-card" />
        <div className="glass h-56 rounded-card" />
        <div className="glass h-56 rounded-card" />
      </div>
    </div>
  );
}
