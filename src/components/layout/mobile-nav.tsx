"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { useSyncStatus } from "@/lib/state/store";
import { useT } from "@/lib/i18n";
import { Brand, SyncDot } from "./brand";
import { openCommandPalette } from "./command-palette";
import { SETTINGS, TAB_BAR, TOP_BAR } from "./nav-items";

export function MobileTopBar() {
  const { sync } = useSyncStatus();
  const { t } = useT();
  const pathname = usePathname();
  const settingsActive = pathname === SETTINGS.href;
  return (
    <header className="sticky top-3 z-40 mb-4 md:hidden print:hidden">
      <div className="glass-strong flex items-center gap-2 rounded-full py-1.5 pl-2 pr-2.5">
        <Brand />
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <SyncDot sync={sync} />
          <button type="button" onClick={openCommandPalette} aria-label={t("palette.title")} className="icon-btn size-8 shrink-0">
            <Icon name="search" size={17} strokeWidth={1.8} />
          </button>
          {TOP_BAR.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={t(item.label)}
                aria-current={active ? "page" : undefined}
                className={`icon-btn size-8 shrink-0 ${active ? "text-accent" : ""}`}
              >
                <Icon name={item.icon} size={17} strokeWidth={active ? 2.2 : 1.8} />
              </Link>
            );
          })}
          <Link
            href={SETTINGS.href}
            aria-label={t(SETTINGS.label)}
            aria-current={settingsActive ? "page" : undefined}
            className={`icon-btn size-8 shrink-0 ${settingsActive ? "text-accent" : ""}`}
          >
            <Icon name={SETTINGS.icon} size={17} strokeWidth={settingsActive ? 2.2 : 1.8} />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function TabBar() {
  const pathname = usePathname();
  const { t } = useT();
  return (
    <nav className="glass-strong fixed inset-x-3 bottom-3 z-40 flex rounded-full px-1 py-1.5 md:hidden print:hidden">
      {TAB_BAR.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={t(item.label)}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 rounded-full px-1 py-1 transition-colors duration-150 ${
              active ? "text-accent" : "text-ink-3"
            }`}
          >
            {active && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-full bg-accent-soft"
              />
            )}
            <Icon
              name={item.icon}
              size={20}
              strokeWidth={active ? 2.2 : 1.8}
              className="relative"
            />
            <span className="relative w-full truncate text-center text-[10px] font-semibold tracking-tight">
              {t(item.short)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
