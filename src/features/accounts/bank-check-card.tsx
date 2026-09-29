"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Icon } from "@/components/ui";
import { formatDateShort, formatTime, pad, todayISO } from "@/lib/date";
import { accountBalances } from "@/lib/finance/finmath";
import { formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { Currency } from "@/lib/types";
import { AccountMark } from "./account-mark";

interface BankAccount {
  id: string;
  currency: Currency | null;
  balance: number;
  balanceAt?: number;
}

interface BankStatus {
  connected: boolean;
  accounts: BankAccount[];
}

export function BankCheckCard({ onMatch }: { onMatch: (accountId: string, amount: number) => void }) {
  const { state } = useStore();
  const { t } = useT();
  const links = state.settings.bankLinks ?? {};
  const linked = Object.keys(links).length > 0;
  const [bank, setBank] = useState<BankStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!linked) return;
    let alive = true;
    void fetch("/api/monobank", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: BankStatus | null) => alive && setBank(body))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [linked]);

  if (!bank?.connected) return null;
  const today = todayISO();
  const balances = accountBalances(state, today);
  const rows = bank.accounts
    .filter((a) => a.currency && links[a.id])
    .map((a) => {
      const account = state.savings.find((s) => s.id === links[a.id]);
      if (!account || account.currency !== a.currency) return null;
      const app = balances.get(account.id) ?? 0;
      return { bank: a, account, app, diff: Math.round((a.balance - app) * 100) / 100 };
    })
    .filter((r) => r !== null);
  if (rows.length === 0) return null;

  const when = (unix?: number) => {
    if (!unix) return "";
    const at = new Date(unix * 1000);
    const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
    return day === today ? formatTime(at.toISOString()) : `${formatDateShort(day)}, ${formatTime(at.toISOString())}`;
  };

  const checkNow = async () => {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/monobank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as (BankStatus & { error?: string }) | null;
    if (res?.ok && body) setBank(body);
    else if (body?.error?.startsWith("wait:")) setNote(t("bankcheck.wait", { seconds: body.error.slice(5) }));
    else setNote(t("bankcheck.failed"));
    setBusy(false);
  };

  const off = rows.filter((r) => Math.abs(r.diff) >= 0.01).length;

  return (
    <Card
      title={t("bankcheck.title")}
      subtitle={off > 0 ? t("bankcheck.subtitle.off") : t("bankcheck.subtitle.ok")}
      icon="bank"
      action={
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void checkNow()}>
          <Icon name="refresh" size={14} />
          {t("bankcheck.check")}
        </Button>
      }
    >
      <ul className="rows">
        {rows.map(({ bank: b, account, app, diff }) => (
          <li key={b.id} className="flex items-center gap-2.5 px-2.5 py-2">
            <AccountMark acc={account} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink-1">{account.name}</span>
              <span className="caption block truncate">
                {t("bankcheck.bank", { amount: formatMoney(b.balance, account.currency), time: when(b.balanceAt) })}
              </span>
            </span>
            {Math.abs(diff) < 0.01 ? (
              <Badge tone="income">
                <Icon name="check" size={11} strokeWidth={3} />
                {t("bankcheck.matches")}
              </Badge>
            ) : (
              <span className="flex shrink-0 items-center gap-2">
                <span className={`tnum text-sm font-semibold ${diff > 0 ? "text-income" : "text-expense"}`}>
                  {formatMoney(diff, account.currency, { sign: true })}
                </span>
                <Button size="sm" variant="ghost" onClick={() => onMatch(account.id, b.balance)} title={t("bankcheck.match.hint", { amount: formatMoney(app, account.currency) })}>
                  {t("bankcheck.match")}
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {note && <p className="caption mt-2">{note}</p>}
    </Card>
  );
}
