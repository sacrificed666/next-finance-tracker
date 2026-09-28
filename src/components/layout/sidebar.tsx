"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { Brand } from "./brand";
import { PaletteButton } from "./command-palette";
import { NAV_GROUPS, PROFILE, SETTINGS, type NavItem } from "./nav-items";

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const { t } = useT();
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-2.5 rounded-field px-3 py-2 text-sm font-semibold transition-[background-color,color] duration-150 ${
        active
          ? "glass-el text-ink-1"
          : "text-ink-2 hover:bg-fill-hover hover:text-ink-1"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent-fill"
        />
      )}
      <Icon
        name={item.icon}
        size={18}
        strokeWidth={active ? 2.2 : 1.8}
        className={active ? "text-accent" : undefined}
      />
      <span className="truncate">{t(item.label)}</span>
    </Link>
  );
}

function SignOutRow() {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={() => void signOut({ redirectTo: "/login" })}
      className="row-tap flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-ink-2 transition-colors hover:text-ink-1"
    >
      <Icon name="logout" size={17} />
      {t("nav.signOut")}
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useT();
  return (
    <aside className="fixed inset-y-3 left-3 z-40 hidden w-52 md:flex">
      <div className="glass flex h-full w-full flex-col overflow-y-auto rounded-card p-3">
        <Brand />
        <PaletteButton className="mt-3" />

        <nav className="mt-3 flex flex-1 flex-col gap-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="card-title px-3 pb-1">{t(group.title)}</p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavRow key={item.href} item={item} active={pathname === item.href} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-3 space-y-0.5 border-t border-hairline pt-2.5">
          <NavRow item={PROFILE} active={pathname === PROFILE.href} />
          <NavRow item={SETTINGS} active={pathname === SETTINGS.href} />
          <SignOutRow />
        </div>
      </div>
    </aside>
  );
}
