"use client";

import { Button, Icon, Sheet, Switch } from "@/components/ui";
import { useT, type MessageKey } from "@/lib/i18n";
import { DEFAULT_DASHBOARD, isDefaultDashboard, moveCard, showCard } from "@/lib/state/dashboard";
import type { DashboardCardId, DashboardLayout } from "@/lib/types";

export const CARD_TITLES: Record<DashboardCardId, MessageKey> = {
  quickAdd: "dash.quick",
  cashFlow: "tx.flow",
  spending: "dash.spending",
  cashAhead: "dash.layout.ahead",
  holdings: "dash.worthByHolding",
  subscriptions: "tx.subs",
  currency: "dash.currency",
  progress: "dash.progress",
};

export function LayoutSheet({
  layout,
  onChange,
  onClose,
}: {
  layout: DashboardLayout;
  onChange: (next: DashboardLayout) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const hidden = new Set(layout.hidden);

  const column = (title: string, ids: DashboardCardId[]) => (
    <section className="space-y-2">
      <h3 className="caption">{title}</h3>
      <ul className="space-y-1.5">
        {ids.map((id, i) => {
          const name = t(CARD_TITLES[id]);
          return (
            <li key={id} className="flex items-center gap-2 rounded-field border border-hairline px-3 py-2">
              <span className={`min-w-0 flex-1 truncate text-sm font-medium ${hidden.has(id) ? "text-ink-3" : "text-ink-1"}`}>{name}</span>
              <button
                type="button"
                aria-label={t("dash.layout.up", { name })}
                disabled={i === 0}
                onClick={() => onChange(moveCard(layout, id, -1))}
                className="icon-btn size-8 bg-ghost text-ink-2 disabled:opacity-35"
              >
                <Icon name="chevronDown" size={15} strokeWidth={2.2} className="rotate-180" />
              </button>
              <button
                type="button"
                aria-label={t("dash.layout.down", { name })}
                disabled={i === ids.length - 1}
                onClick={() => onChange(moveCard(layout, id, 1))}
                className="icon-btn size-8 bg-ghost text-ink-2 disabled:opacity-35"
              >
                <Icon name="chevronDown" size={15} strokeWidth={2.2} />
              </button>
              <Switch checked={!hidden.has(id)} onChange={(shown) => onChange(showCard(layout, id, shown))} label={t("dash.layout.show", { name })} />
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("dash.layout.title")}
      footer={
        <>
          <Button variant="ghost" disabled={isDefaultDashboard(layout)} onClick={() => onChange(DEFAULT_DASHBOARD)}>
            {t("dash.layout.reset")}
          </Button>
          <Button onClick={onClose}>{t("dash.layout.done")}</Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">{t("dash.layout.hint")}</p>
      {column(t("dash.layout.main"), layout.main)}
      {column(t("dash.layout.side"), layout.side)}
    </Sheet>
  );
}
