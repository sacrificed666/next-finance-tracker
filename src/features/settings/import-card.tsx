"use client";

import { useEffect, useRef, useState } from "react";
import { OptionPicker } from "@/components/forms/option-picker";
import { useAccountGroups } from "@/components/forms/picker-groups";
import { Button, Card, IconDisc, SegmentedControl, Switch, TextInput } from "@/components/ui";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { pad } from "@/lib/date";
import { guessMapping, parseCsv, type CsvMapping } from "@/lib/finance/csv";
import { applyImport, candidateFromMono, prepareImport, type ImportCandidate, type MonoLine } from "@/lib/finance/import";
import { formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { uid, useStore } from "@/lib/state/store";
import type { Currency } from "@/lib/types";
import { CsvSheet } from "./csv-sheet";
import { ImportPreviewSheet } from "./import-preview";

interface MonoAccount {
  id: string;
  kind?: "card" | "jar";
  currency: Currency | null;
  type: string;
  maskedPan: string;
  title?: string;
  balance: number;
}

interface MonoStatus {
  connected: boolean;
  name: string;
  accounts: MonoAccount[];
  webhook?: boolean;
}

export interface CsvDraft {
  name: string;
  header: string[];
  rows: string[][];
  mapping: CsvMapping;
}

const dateOf = (unix: number) => {
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function readText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1251").decode(buffer);
  }
}

export function ImportCard() {
  const { state, update } = useStore();
  const { t, tp } = useT();
  const [mono, setMono] = useState<MonoStatus | null>(null);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<"7" | "14" | "31">("31");
  const [preview, setPreview] = useState<{ title: string; candidates: ImportCandidate[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [csv, setCsv] = useState<CsvDraft | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const accountGroups = useAccountGroups(state.savings, [{ value: "", label: t("import.mono.skip") }]);
  const links = state.settings.bankLinks ?? {};

  useEffect(() => {
    alive.current = true;
    void fetch("/api/monobank", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: MonoStatus | null) => alive.current && setMono(body))
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, []);

  const failure = async (res: Response) => {
    const { error: code } = (await res.json().catch(() => ({ error: "" }))) as { error: string };
    if (code === "token") return t("import.mono.badToken");
    if (code?.startsWith("wait:")) return t("import.mono.wait", { s: code.slice(5) });
    return t("import.mono.failed");
  };

  const connect = async () => {
    setError(null);
    setStatus(t("import.mono.connecting"));
    const res = await fetch("/api/monobank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setStatus(null);
    if (!res.ok) return setError(await failure(res));
    setMono((await res.json()) as MonoStatus);
    setToken("");
  };

  const setHook = async (on: boolean) => {
    setError(null);
    setStatus(t("import.mono.hook.saving"));
    const res = await fetch("/api/monobank/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    });
    setStatus(null);
    if (!res.ok) {
      const { error: code = "" } = (await res.json().catch(() => ({}))) as { error?: string };
      if (code === "https") return setError(t("import.mono.hook.https"));
      if (code === "token") return setError(t("import.mono.badToken"));
      if (code.startsWith("wait:")) return setError(t("import.mono.wait", { s: code.slice(5) }));
      return setError(t("import.mono.failed"));
    }
    setMono((await res.json()) as MonoStatus);
  };

  const disconnect = async () => {
    await fetch("/api/monobank", { method: "DELETE" });
    setMono({ connected: false, name: "", accounts: [] });
  };

  const setLink = (bankId: string, accountId: string) =>
    update((s) => {
      const next = { ...(s.settings.bankLinks ?? {}) };
      if (accountId) next[bankId] = accountId;
      else delete next[bankId];
      return { ...s, settings: { ...s.settings, bankLinks: next } };
    });

  const openPreview = (title: string, found: ImportCandidate[]) => {
    const candidates = prepareImport(state, found);
    setSelected(new Set(candidates.filter((c) => !c.duplicate).map((c) => c.externalId)));
    setPreview({ title, candidates });
  };

  const loadMono = async () => {
    if (!mono) return;
    setError(null);
    const linked = mono.accounts.filter((a) => a.currency && links[a.id]);
    const to = Math.floor(Date.now() / 1000);
    const from = to - Number(days) * 86_400;
    const found: ImportCandidate[] = [];
    for (const acc of linked) {
      for (;;) {
        if (!alive.current) return;
        setStatus(t("import.mono.loading", { card: acc.maskedPan || acc.id.slice(0, 6) }));
        const res = await fetch(`/api/monobank/statement?account=${encodeURIComponent(acc.id)}&from=${from}&to=${to}`);
        if (res.status === 429) {
          const { error: code } = (await res.json()) as { error: string };
          for (let s = Number(code.split(":")[1] ?? 60); s > 0; s--) {
            if (!alive.current) return;
            setStatus(t("import.mono.wait", { s }));
            await new Promise((r) => setTimeout(r, 1000));
          }
          continue;
        }
        if (!res.ok) {
          setStatus(null);
          return setError(await failure(res));
        }
        const { items } = (await res.json()) as { items: MonoLine[] };
        for (const item of items) found.push(candidateFromMono(state, item, acc.currency!, links[acc.id], dateOf(item.time)));
        break;
      }
    }
    setStatus(null);
    openPreview(t("import.mono.title"), found);
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    const rows = parseCsv(await readText(file));
    if (fileInput.current) fileInput.current.value = "";
    if (rows.length < 2) return setError(t("import.csv.empty"));
    setError(null);
    setCsv({ name: file.name, header: rows[0], rows: rows.slice(1), mapping: guessMapping(rows[0]) });
  };

  const finish = () => {
    if (!preview) return;
    const picked = preview.candidates.filter((c) => selected.has(c.externalId));
    update(
      (s) => applyImport(s, picked, uid),
      tp("import.done", picked.length),
    );
    setPreview(null);
  };

  const trackable = mono?.accounts.filter((a) => a.currency) ?? [];

  return (
    <Card title={t("import.title")} subtitle={t("import.subtitle")} icon="card">
      <div className="space-y-2">
        <div className="rounded-field bg-ghost p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink-1">
              Monobank
              {mono?.connected && <span className="font-normal text-ink-3"> · {mono.name}</span>}
            </p>
            {mono?.connected && (
              <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
                {t("import.mono.disconnect")}
              </Button>
            )}
          </div>

          {!mono?.connected ? (
            <div className="mt-2 space-y-2">
              <p className="caption">
                {t("import.mono.how")}{" "}
                <a href="https://api.monobank.ua/" target="_blank" rel="noreferrer noopener" className="font-semibold text-accent hover:underline">
                  api.monobank.ua
                </a>
              </p>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <TextInput
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={t("import.mono.token")}
                    aria-label={t("import.mono.token")}
                    autoComplete="off"
                  />
                </div>
                <Button onClick={() => void connect()} disabled={token.trim().length < 20 || status !== null}>
                  {t("import.mono.connect")}
                </Button>
              </div>
              <p className="caption">{t("import.mono.private")}</p>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <ul className="rows">
                {trackable.map((acc) => (
                  <li key={acc.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-2.5 py-2 sm:grid-cols-[auto_minmax(0,1fr)_14rem]">
                    <IconDisc colorSlot={acc.kind === "jar" ? 2 : 5} className="size-8 rounded-chip text-sm">
                      {acc.kind === "jar" ? "🫙" : "💳"}
                    </IconDisc>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink-1">
                        {acc.kind === "jar" ? (acc.title || t("import.mono.jar")) : acc.maskedPan || acc.type}
                      </span>
                      <span className="tnum block text-xs text-ink-3">
                        {formatMoney(acc.balance, acc.currency!)} · {CURRENCY_SYMBOL[acc.currency!]}
                      </span>
                    </span>
                    <span className="col-start-2 sm:col-start-auto">
                      <OptionPicker
                        size="sm"
                        label={t("import.mono.bookTo")}
                        value={links[acc.id] ?? ""}
                        onChange={(accountId) => setLink(acc.id, accountId)}
                        groups={accountGroups}
                      />
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  size="sm"
                  label={t("import.mono.period")}
                  options={(["7", "14", "31"] as const).map((d) => ({ value: d, label: t("dash.ahead.days", { days: Number(d) }) }))}
                  value={days}
                  onChange={setDays}
                />
                <Button
                  size="sm"
                  onClick={() => void loadMono()}
                  disabled={status !== null || !trackable.some((a) => links[a.id])}
                >
                  {t("import.mono.load")}
                </Button>
              </div>
              {!trackable.some((a) => links[a.id]) && <p className="caption">{t("import.mono.linkFirst")}</p>}
              <div className="flex items-start gap-3 border-t border-hairline pt-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-1">{t("import.mono.hook")}</p>
                  <p className="caption">{mono.webhook ? t("import.mono.hook.on") : t("import.mono.hook.off")}</p>
                </div>
                <Switch
                  checked={mono.webhook ?? false}
                  onChange={(on) => void setHook(on)}
                  label={t("import.mono.hook")}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-field bg-ghost p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-1">{t("import.csv.title")}</p>
            <p className="caption">{t("import.csv.caption")}</p>
          </div>
          <Button variant="ghost" onClick={() => fileInput.current?.click()}>
            {t("settings.data.chooseFile")}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => void pickFile(e.target.files?.[0])}
          />
        </div>
      </div>

      {status && <p className="caption mt-2" aria-live="polite">{status}</p>}
      {error && <p className="mt-2 text-sm text-expense" role="alert">{error}</p>}

      {csv && (
        <CsvSheet
          draft={csv}
          onChange={setCsv}
          onClose={() => setCsv(null)}
          onPreview={(found) => {
            setCsv(null);
            openPreview(t("import.csv.title"), found);
          }}
        />
      )}
      {preview && (
        <ImportPreviewSheet
          title={preview.title}
          candidates={preview.candidates}
          selected={selected}
          onToggle={(ids, on) =>
            setSelected((prev) => {
              const next = new Set(prev);
              for (const id of ids) {
                if (on) next.add(id);
                else next.delete(id);
              }
              return next;
            })
          }
          onChange={(externalId, categoryId) =>
            setPreview({
              ...preview,
              candidates: preview.candidates.map((c) => (c.externalId === externalId ? { ...c, categoryId } : c)),
            })
          }
          onImport={finish}
          onClose={() => setPreview(null)}
        />
      )}
    </Card>
  );
}
