"use client";

import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import type { Currency } from "@/lib/types";
import type { Forecast } from "./use-forecast";

/** The projection sampled once a year, with a bar behind each total. */
export function YearlyTableCard({ f, view, withDebts }: { f: Forecast; view: Currency; withDebts: boolean }) {
  const { t } = useT();
  const showDebts = withDebts && f.state.debts.length > 0;
  const rows = f.projection.map((p, i) => ({ p, i })).filter(({ i }) => i % 12 === 0);
  const maxTotal = Math.max(0, ...rows.map(({ p, i }) => f.show(p.net, i)));

  return (
    <Card title={t("forecast.yearly", { currency: view })} icon="calendar">
      <div className="table-scroll">
        <table className="data-table sm:min-w-104">
          <thead>
            <tr>
              <th className="text-left">{t("forecast.col.year")}</th>
              {/* On a phone the parts step aside so the table fits without scrolling sideways. */}
              <th className="hidden text-right sm:table-cell">{t("forecast.savings")}</th>
              <th className="hidden text-right sm:table-cell">{t("balance.investments")}</th>
              {showDebts && <th className="hidden text-right sm:table-cell">{t("balance.debts")}</th>}
              <th className="w-[34%] text-right">{t("forecast.col.total")}</th>
              <th className="text-right">{t("forecast.col.added")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, i }, idx) => {
              const prev = idx > 0 ? rows[idx - 1] : null;
              const added = prev ? f.show(p.net, i) - f.show(prev.p.net, prev.i) : 0;
              return (
                <tr key={p.month}>
                  <td>
                    <span className={i === 0 ? "font-semibold text-ink-1" : "text-ink-2"}>
                      {i === 0 ? t("forecast.now") : p.month.slice(0, 4)}
                    </span>
                  </td>
                  <td className="tnum hidden text-right text-ink-2 sm:table-cell">{formatMoney(f.show(p.savings, i), view, { compact: true })}</td>
                  <td className="tnum hidden text-right text-ink-2 sm:table-cell">
                    {formatMoney(f.show(p.investments, i), view, { compact: true })}
                  </td>
                  {showDebts && (
                    <td className="tnum hidden text-right text-expense sm:table-cell">
                      {p.debt > 0 ? `−${formatMoney(f.show(p.debt, i), view, { compact: true })}` : "—"}
                    </td>
                  )}
                  <td className="text-right">
                    {/* The total, with a bar that grows towards the horizon. */}
                    <span className="flex items-center justify-end gap-2.5">
                      <span aria-hidden className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-ghost-2 sm:block">
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${maxTotal > 0 ? (f.show(p.net, i) / maxTotal) * 100 : 0}%` }}
                        />
                      </span>
                      <span className="tnum w-20 shrink-0 whitespace-nowrap font-semibold text-ink-1">
                        {formatMoney(f.show(p.net, i), view, { compact: true })}
                      </span>
                    </span>
                  </td>
                  <td className={`tnum text-right ${added > 0 ? "text-income" : "text-ink-3"}`}>
                    {prev ? formatMoney(added, view, { compact: true, sign: true }) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-3">{t("forecast.yearly.hint")}</p>
    </Card>
  );
}
