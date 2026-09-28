"use client";

import { Button, Icon } from "@/components/ui";
import { addMonths, currentMonth, formatMonth, monthDiff } from "@/lib/date";
import { useT } from "@/lib/i18n";
import { PLANNING_HORIZON_MONTHS } from "@/lib/state/store";

/** Steps through months, up to the planning horizon ahead. Sits in the hero's header. */
export function MonthSwitcher({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const { t } = useT();
  const nowMonth = currentMonth();
  const canGoNext = monthDiff(nowMonth, month) < PLANNING_HORIZON_MONTHS - 1;
  const arrow =
    "icon-btn size-9 shrink-0 border border-hairline bg-ghost text-ink-2 shadow-[inset_0_1px_0_var(--card-highlight)] disabled:opacity-40";

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <button type="button" aria-label={t("month.previous")} onClick={() => onChange(addMonths(month, -1))} className={arrow}>
        <Icon name="chevronLeft" size={18} strokeWidth={2.2} />
      </button>
      <span className="body-strong flex min-w-0 flex-1 items-center justify-center gap-2 font-semibold sm:min-w-44">
        <span className="truncate">{formatMonth(month)}</span>
        {month === nowMonth && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">{t("month.this")}</span>
        )}
      </span>
      {month !== nowMonth && (
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onChange(nowMonth)}>
          {t("month.today")}
        </Button>
      )}
      <button
        type="button"
        aria-label={t("month.next")}
        onClick={() => onChange(addMonths(month, 1))}
        disabled={!canGoNext}
        className={arrow}
      >
        <Icon name="chevronRight" size={18} strokeWidth={2.2} />
      </button>
    </div>
  );
}
