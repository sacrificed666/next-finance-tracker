"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Button, Toast } from "./ui";
import { Icon } from "./icons";
import { MobileTopBar, Sidebar, TabBar } from "./nav";
import { AutoRefresh } from "./auto-refresh";

const AUTH_ROUTES = new Set(["/login", "/register"]);

export function AppShell({ children }: { children: ReactNode }) {
  const { hydrated, loadError, reload, sync, undoLabel, undo, dismissUndo } = useStore();
  const { t } = useT();
  const conflict = sync === "conflict";
  const pathname = usePathname();

  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(
      () => document.documentElement.setAttribute("data-entered", ""),
      900,
    );
    return () => clearTimeout(id);
  }, [hydrated]);

  if (AUTH_ROUTES.has(pathname)) {
    return (
      <>
        <div className="app-backdrop" aria-hidden />
        <div className="orb-b" aria-hidden />
        {children}
      </>
    );
  }

  return (
    <>
      <div className="app-backdrop" aria-hidden />
      <div className="orb-b" aria-hidden />
      <AutoRefresh />
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
      {conflict ? (
        <Toast
          message={t("shell.conflictToast")}
          actionLabel={t("shell.reload")}
          onAction={() => void reload()}
        />
      ) : (
        undoLabel && (
          <Toast
            message={undoLabel}
            actionLabel={t("common.undo")}
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
  const { t } = useT();
  const [before, after] = t("shell.dbBody").split("{env}");
  return (
    <section className="glass glow mx-auto max-w-xl rounded-card p-6 text-center sm:p-8">
      <span
        aria-hidden
        className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-ghost text-ink-3"
      >
        <Icon name="plug" size={24} />
      </span>
      <h1 className="text-lg font-bold text-ink-1">{t("shell.dbTitle")}</h1>
      <p className="mt-2 text-sm text-ink-2">
        {before}
        <code className="text-ink-1">DATABASE_URL</code>
        {after}
      </p>
      <p className="mt-3 wrap-break-word rounded-field bg-ghost px-3 py-2 text-xs text-ink-3">
        {message}
      </p>
      <Button className="mt-5" onClick={onRetry}>
        {t("shell.tryAgain")}
      </Button>
    </section>
  );
}

function Skeleton({ dashboard }: { dashboard: boolean }) {
  const { t } = useT();
  return (
    <div className="space-y-4 sm:space-y-5" aria-label={t("common.loading")} role="status">
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
