import type { IconName } from "@/components/ui";
import type { MessageKey } from "@/lib/i18n";

export interface NavItem {
  href: string;
  label: MessageKey;
  short: MessageKey;
  icon: IconName;
  compact?: boolean;
}

export const NAV_GROUPS: Array<{ title: MessageKey; items: NavItem[] }> = [
  {
    title: "nav.group.overview",
    items: [
      { href: "/", label: "nav.dashboard", short: "nav.dashboard.short", icon: "home" },
      { href: "/calendar", label: "nav.calendar", short: "nav.calendar.short", icon: "calendar", compact: true },
      { href: "/reports", label: "nav.reports", short: "nav.reports.short", icon: "chart", compact: true },
    ],
  },
  {
    title: "nav.group.money",
    items: [
      { href: "/transactions", label: "nav.expenses", short: "nav.expenses.short", icon: "spend" },
      { href: "/income", label: "nav.income", short: "nav.income.short", icon: "arrowDown" },
    ],
  },
  {
    title: "nav.group.wealth",
    items: [
      { href: "/accounts", label: "nav.accounts", short: "nav.accounts.short", icon: "wallet" },
      { href: "/investments", label: "nav.investments", short: "nav.investments.short", icon: "bars" },
      { href: "/forecast", label: "nav.forecast", short: "nav.forecast.short", icon: "trend" },
    ],
  },
];

export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export const TAB_BAR: NavItem[] = NAV.filter((item) => !item.compact);

export const TOP_BAR: NavItem[] = NAV.filter((item) => item.compact);

export const PROFILE: NavItem = {
  href: "/profile",
  label: "nav.profile",
  short: "nav.profile.short",
  icon: "user",
};

export const SETTINGS: NavItem = {
  href: "/settings",
  label: "nav.settings",
  short: "nav.settings.short",
  icon: "gear",
};
