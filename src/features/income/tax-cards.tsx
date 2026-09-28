"use client";

import { useEffect, useState } from "react";
import { Card, Icon, SummaryPanel } from "@/components/ui";
import { formatDate, formatDateShort, formatMonth, todayISO } from "@/lib/date";
import { formatMoney } from "@/lib/finance/money";
import { taxRegime } from "@/lib/finance/tax";
import { hasTaxCalendar, taxObligations, upcomingObligations, type TaxObligation } from "@/lib/finance/tax-calendar";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";

const DAY_MS = 86_400_000;
const daysUntil = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

function usePeriodLabel() {
  const { t } = useT();
  return (period: string) => {
    const quarter = /^(\d{4})-Q(\d)$/.exec(period);
    if (quarter) return t("taxcal.quarter", { q: quarter[2], year: quarter[1] });
    if (/^\d{4}-\d{2}$/.test(period)) return formatMonth(period);
    return period;
  };
}

/**
 * The next tax filings and payments for the regime in the tax profile, with
 * a tap to mark each one done. Renders nothing for regimes without a fixed
 * calendar.
 */
export function TaxCalendarCard() {
  const { state, update } = useStore();
  const { t, tp, tk } = useT();
  const periodLabel = usePeriodLabel();
  const today = todayISO();
  const regime = state.settings.tax.regime;
  if (!hasTaxCalendar(regime)) return null;

  const items = upcomingObligations(state, today, 6);
  // Payments sharing the earliest deadline are paid together, so the summary adds them up.
  const first = items.find((o) => o.amount !== undefined);
  const due = first ? items.filter((o) => o.amount !== undefined && o.due === first.due) : [];
  const name = (o: TaxObligation) => t(`taxcal.${o.kind}`, { period: periodLabel(o.period) });
  const when = (o: TaxObligation) => {
    const days = daysUntil(today, o.due);
    if (days < 0) return t("taxcal.overdue", { date: formatDateShort(o.due) });
    if (days === 0) return t("taxcal.today");
    return `${formatDateShort(o.due)} · ${tp("taxcal.inDays", days)}`;
  };
  const markPaid = (o: TaxObligation) =>
    update(
      (s) => ({ ...s, settings: { ...s.settings, taxPaid: { ...(s.settings.taxPaid ?? {}), [o.id]: today } } }),
      t("taxcal.paidToast", { name: name(o) }),
    );

  return (
    <Card title={t("taxcal.title")} subtitle={tk(taxRegime(regime).labelKey, regime)} icon="receipt">
      {first ? (
        <SummaryPanel
          className="mb-3"
          value={formatMoney(due.reduce((sum, o) => sum + (o.amount ?? 0), 0), "UAH")}
          tone={daysUntil(today, first.due) < 0 ? "expense" : undefined}
          meta={when(first)}
        >
          <p className="caption">{due.map(name).join(" · ")}</p>
        </SummaryPanel>
      ) : (
        <p className="caption mb-3">{t("taxcal.allSet")}</p>
      )}
      <ul className="rows">
        {items.map((o) => {
          const late = daysUntil(today, o.due) < 0;
          return (
            <li key={o.id} className="flex items-center gap-2.5 px-2.5 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink-1">{name(o)}</span>
                <span className={`tnum block text-xs ${late ? "text-expense" : "text-ink-3"}`}>{when(o)}</span>
              </span>
              {o.amount !== undefined && (
                <span className="tnum shrink-0 text-sm font-semibold text-ink-1">{formatMoney(o.amount, "UAH", { compact: true })}</span>
              )}
              <button
                type="button"
                onClick={() => markPaid(o)}
                aria-label={t("taxcal.markPaid")}
                title={t("taxcal.markPaid")}
                className="icon-btn size-8 shrink-0 border border-hairline text-ink-3 hover:text-income"
              >
                <Icon name="check" size={14} strokeWidth={2.4} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="caption mt-3">{t("taxcal.note")}</p>
    </Card>
  );
}

/** NBU rates for foreign-currency income, fetched once per currency and day. */
function useNbuRates(keys: string[]): Map<string, number> {
  const [rates, setRates] = useState<Map<string, number>>(new Map());
  const wanted = keys.join(",");
  useEffect(() => {
    let alive = true;
    const missing = wanted.split(",").filter(Boolean);
    void (async () => {
      const found = new Map<string, number>();
      for (const key of missing) {
        const [currency, date] = key.split(":");
        const res = await fetch(`/api/nbu-rate?currency=${currency}&date=${date}`).catch(() => null);
        const body = res?.ok ? ((await res.json()) as { rate: number }) : null;
        if (body?.rate) found.set(key, body.rate);
      }
      if (alive && found.size > 0) setRates(found);
    })();
    return () => {
      alive = false;
    };
  }, [wanted]);
  return rates;
}

/**
 * The year by quarter as the declaration sees it: gross income in hryvnias —
 * foreign currency at the NBU rate of the day it arrived — and what each tax
 * comes to, with what has been marked as paid.
 */
export function QuarterlyTaxCard() {
  const { state, update } = useStore();
  const { t } = useT();
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const regime = state.settings.tax.regime;
  const paid = state.settings.taxPaid ?? {};

  const yearIncome = state.transactions.filter((tx) => tx.type === "income" && tx.tax && tx.date.startsWith(String(year)));
  // The NBU publishes a rate for days that have passed; planned income uses today's rate until then.
  const fxKeys = [
    ...new Set(
      yearIncome.filter((tx) => tx.currency !== "UAH" && tx.date <= today).map((tx) => `${tx.currency}:${tx.date}`),
    ),
  ];
  const nbu = useNbuRates(fxKeys);
  if (!hasTaxCalendar(regime)) return null;

  const obligations = taxObligations(state, year);
  const quarters = [1, 2, 3, 4].map((q) => {
    const period = `${year}-Q${q}`;
    const months = [q * 3 - 2, q * 3 - 1, q * 3].map((m) => `${year}-${String(m).padStart(2, "0")}`);
    const inQuarter = (o: TaxObligation) => o.period === period || months.includes(o.period);
    const own = obligations.filter(inQuarter);
    const gross = yearIncome
      .filter((tx) => months.includes(tx.date.slice(0, 7)))
      .reduce((sum, tx) => {
        const rate = tx.currency === "UAH" ? 1 : (nbu.get(`${tx.currency}:${tx.date}`) ?? state.settings.rates[tx.currency]);
        return sum + tx.tax!.gross * rate;
      }, 0);
    const sum = (kind: TaxObligation["kind"]) => own.filter((o) => o.kind === kind).reduce((s, o) => s + (o.amount ?? 0), 0);
    const payments = own.filter((o) => o.amount !== undefined);
    return {
      period,
      q,
      gross,
      single: sum("single"),
      levy: sum("levy"),
      esv: sum("esv"),
      vat: sum("vat"),
      settled: payments.length > 0 && payments.every((o) => paid[o.id]),
      payments,
    };
  });
  const hasVat = quarters.some((q) => q.vat > 0);
  const yearDeclaration = obligations.find(
    (o) => o.kind === "declaration" && (o.period === `${year}-Q4` || o.period === String(year)),
  );
  const toggle = (row: (typeof quarters)[number]) =>
    update((s) => {
      const next = { ...(s.settings.taxPaid ?? {}) };
      for (const o of row.payments) {
        if (row.settled) delete next[o.id];
        else next[o.id] = today;
      }
      return { ...s, settings: { ...s.settings, taxPaid: next } };
    });
  const money = (v: number) => (v > 0.5 ? formatMoney(v, "UAH", { compact: true }) : "—");

  return (
    <Card title={t("taxcal.quarterly")} subtitle={t("taxcal.quarterly.subtitle", { year })} icon="calendar">
      <div className="table-scroll">
        <table className="data-table sm:min-w-120">
          <thead>
            <tr>
              <th className="text-left">{t("taxcal.col.quarter")}</th>
              <th className="text-right">{t("taxcal.col.income")}</th>
              {/* On a phone the four parts fold into one total, so the table fits the screen. */}
              <th className="text-right sm:hidden">{t("taxcal.col.taxes")}</th>
              <th className="hidden text-right sm:table-cell">{t("taxcal.col.single")}</th>
              <th className="hidden text-right sm:table-cell">{t("taxcal.col.levy")}</th>
              <th className="hidden text-right sm:table-cell">{t("taxcal.col.esv")}</th>
              {hasVat && <th className="hidden text-right sm:table-cell">{t("taxcal.col.vat")}</th>}
              <th className="w-24 text-right">{t("taxcal.col.paid")}</th>
            </tr>
          </thead>
          <tbody>
            {quarters.map((row) => (
              <tr key={row.period}>
                <td className="font-semibold text-ink-1">{t("taxcal.quarter", { q: row.q, year })}</td>
                <td className="tnum text-right text-ink-1">{money(row.gross)}</td>
                <td className="tnum text-right text-ink-2 sm:hidden">{money(row.single + row.levy + row.esv + row.vat)}</td>
                <td className="tnum hidden text-right text-ink-2 sm:table-cell">{money(row.single)}</td>
                <td className="tnum hidden text-right text-ink-2 sm:table-cell">{money(row.levy)}</td>
                <td className="tnum hidden text-right text-ink-2 sm:table-cell">{money(row.esv)}</td>
                {hasVat && <td className="tnum hidden text-right text-ink-2 sm:table-cell">{money(row.vat)}</td>}
                <td className="text-right">
                  <button
                    type="button"
                    onClick={() => toggle(row)}
                    aria-pressed={row.settled}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                      row.settled ? "bg-income/15 text-income" : "bg-ghost text-ink-3 hover:text-ink-1"
                    }`}
                  >
                    {row.settled && <Icon name="check" size={12} strokeWidth={2.6} />}
                    {row.settled ? t("taxcal.paid") : t("taxcal.notYet")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="caption mt-3">
        {fxKeys.length > 0 ? `${t("taxcal.nbuNote")} ` : ""}
        {yearDeclaration && t("taxcal.declared", { date: formatDate(yearDeclaration.due) })}
      </p>
    </Card>
  );
}
