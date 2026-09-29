"use client";

import { useState } from "react";
import { AddButton, Card, IconDisc, SummaryPanel } from "@/components/ui";
import { addMonths, currentMonth, formatMonthShort } from "@/lib/date";
import { averageKept } from "@/lib/finance/finmath";
import { convert, formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { WishItem, WishPriority } from "@/lib/types";
import { WishSheet } from "./wish-sheet";

const ORDER: Record<WishPriority, number> = { high: 0, normal: 1, low: 2 };

export function WishlistCard() {
  const { state } = useStore();
  const { t, tp } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const [sheet, setSheet] = useState<WishItem | "new" | null>(null);

  const pace = Math.max(0, averageKept(state, currentMonth()));
  const items = [...state.wishlist].sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || a.price - b.price);
  const inBase = (w: WishItem) => convert(w.price, w.currency, base, settings.rates);
  const total = items.reduce((sum, w) => sum + inBase(w), 0);

  let running = 0;
  const when = new Map<string, string>();
  for (const w of items) {
    running += inBase(w);
    if (pace > 0) when.set(w.id, addMonths(currentMonth(), Math.max(0, Math.ceil(running / pace) - 1)));
  }

  return (
    <Card
      title={t("wish.title")}
      subtitle={t("wish.subtitle")}
      icon="star"
      action={<AddButton onClick={() => setSheet("new")} label={t("common.add")} />}
    >
      {items.length === 0 ? (
        <p className="caption">{t("wish.empty")}</p>
      ) : (
        <>
          <SummaryPanel
            className="mb-3"
            value={formatMoney(total, base, { compact: true })}
            meta={pace > 0 ? t("wish.pace", { amount: formatMoney(pace, base, { compact: true }) }) : t("wish.noPace")}
          >
            <p className="caption">{tp("wish.count", items.length)}</p>
          </SummaryPanel>
          <ul className="rows">
            {items.map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => setSheet(w)} className="row-tap flex w-full items-center gap-2.5 px-2.5 py-2 text-left">
                  <IconDisc colorSlot={w.priority === "high" ? 9 : w.priority === "normal" ? 4 : undefined} className="size-8 rounded-full text-sm">
                    {w.icon}
                  </IconDisc>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink-1">{w.name}</span>
                    <span className="block truncate text-xs text-ink-3">
                      {w.month
                        ? t("wish.planned", { month: formatMonthShort(w.month) })
                        : when.has(w.id)
                          ? t("wish.affordable", { month: formatMonthShort(when.get(w.id)!) })
                          : t(`wish.priority.${w.priority}`)}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-sm font-semibold text-ink-1">{formatMoney(w.price, w.currency, { compact: true })}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {sheet && <WishSheet key={sheet === "new" ? "new" : sheet.id} target={sheet} onClose={() => setSheet(null)} />}
    </Card>
  );
}
