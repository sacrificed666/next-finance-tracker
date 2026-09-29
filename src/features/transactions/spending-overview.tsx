"use client";

import { CategoryBreakdown, PaceLines, type BreakdownSegment } from "@/components/charts";
import { Card, EmptyState, Icon, SegmentedControl } from "@/components/ui";
import { addMonths, currentMonth, dateInMonth, daysInMonth, formatMonth, formatMonthShort, todayISO } from "@/lib/date";
import { expensesByCategory, rollupToParents } from "@/lib/finance/finmath";
import { convert, formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { oneOf, usePersistentState } from "@/lib/state/listing";
import { useStore } from "@/lib/state/store";

export function SpendingOverview({ month }: { month: string }) {
  const { state } = useStore();
  const { t, tp, category } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();
  const catById = new Map(state.categories.map((c) => [c.id, c]));

  const [detail, setDetail] = usePersistentState<"groups" | "detailed">(
    "spend.detail",
    "groups",
    oneOf(["groups", "detailed"] as const),
  );

  const raw = expensesByCategory(state.transactions, month, settings);
  const spend = detail === "groups" ? rollupToParents(raw, state.categories) : raw;
  const segments: BreakdownSegment[] = [...spend.entries()].map(([categoryId, value]) => {
    const cat = catById.get(categoryId);
    return { id: categoryId, label: category(cat), icon: cat?.icon ?? "❓", value, colorSlot: cat?.colorSlot ?? 3 };
  });
  const hasSubcategorySpend = [...raw.keys()].some((id) => catById.get(id)?.parentId);

  const prevMonth = addMonths(month, -1);
  const dailyTotals = (m: string, upTo: number) =>
    Array.from({ length: upTo }, (_, i) => {
      const date = dateInMonth(m, i + 1);
      return state.transactions
        .filter((tx) => tx.type === "expense" && tx.date === date)
        .reduce((sum, tx) => sum + convert(tx.amount, tx.currency, base, settings.rates), 0);
    });
  const running = (values: number[]) => values.map((_, i) => values.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const elapsed = month === currentMonth() ? Number(today.slice(8)) : month < currentMonth() ? daysInMonth(month) : 0;
  const current = running(dailyTotals(month, elapsed));
  const previous = running(dailyTotals(prevMonth, daysInMonth(prevMonth)));
  const soFar = current[current.length - 1] ?? 0;
  const prevAtSameDay = previous[Math.min(elapsed, previous.length) - 1] ?? 0;

  if (state.transactions.length === 0) return null;

  return (
    <div className="grid items-stretch gap-3 sm:gap-4 md:grid-cols-2">
      <Card
        title={t("tx.where")}
        subtitle={segments.length > 0 ? `${formatMonth(month)} · ${tp("common.categories", segments.length)}` : formatMonth(month)}
        icon="pie"
        action={
          hasSubcategorySpend ? (
            <SegmentedControl
              size="sm"
              label={t("tx.where.detail")}
              options={[
                { value: "groups", label: t("tx.where.groups") },
                { value: "detailed", label: t("tx.where.detailed") },
              ]}
              value={detail}
              onChange={setDetail}
            />
          ) : undefined
        }
      >
        {segments.length > 0 ? (
          <div className="flex flex-1 flex-col justify-center">
            <CategoryBreakdown segments={segments} currency={base} />
          </div>
        ) : (
          <EmptyState icon={<Icon name="receipt" />} title={t("tx.where.empty")} hint={t("tx.where.empty.hint")} />
        )}
      </Card>
      <Card
        title={t("tx.pace")}
        subtitle={`${formatMonthShort(month)} · ${formatMonthShort(prevMonth)}`}
        icon="trend"
      >
        {soFar > 0 || previous.some((v) => v > 0) ? (
          <>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-ink-3">
              {elapsed > 0 && (
                <span className="tnum">{t("tx.daily.avg", { amount: formatMoney(soFar / elapsed, base, { compact: true }) })}</span>
              )}
              {elapsed > 0 && prevAtSameDay > 0 && (
                <span className={`tnum font-semibold ${soFar <= prevAtSameDay ? "text-income" : "text-expense"}`}>
                  {t("tx.pace.vs", {
                    delta: formatMoney(soFar - prevAtSameDay, base, { compact: true, sign: true }),
                    month: formatMonthShort(prevMonth),
                  })}
                </span>
              )}
            </div>
            <PaceLines
              current={current}
              previous={previous}
              days={Math.max(daysInMonth(month), previous.length)}
              currency={base}
              currentLabel={formatMonthShort(month)}
              previousLabel={formatMonthShort(prevMonth)}
              caption={t("tx.pace.caption")}
              dayLabel={(day) => t("tx.pace.day", { day })}
            />
          </>
        ) : (
          <EmptyState icon={<Icon name="chart" />} title={t("tx.where.empty")} hint={t("tx.where.empty.hint")} />
        )}
      </Card>
    </div>
  );
}
