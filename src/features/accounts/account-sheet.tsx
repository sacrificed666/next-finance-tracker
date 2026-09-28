"use client";

import { useState } from "react";
import {
  Button,
  Field,
  FieldSet,
  Icon,
  Monogram,
  OptionChips,
  RemoteLogo,
  SegmentedControl,
  Select,
  Sheet,
  Switch,
  TextInput,
} from "@/components/ui";
import {
  BANKABLE_KINDS,
  BRAND_GROUP_LABEL_KEY,
  BRAND_GROUP_ORDER,
  BRANDS,
  brandInfo,
  brandLogoSources,
} from "@/lib/catalog/brands";
import { CUSTOM_GAME_ID, GAMES, gameLogoSources } from "@/lib/catalog/games";
import { ACCOUNT_KINDS, CURRENCIES, CURRENCY_SYMBOL, ICON_CHOICES } from "@/lib/constants";
import { formatDateTime } from "@/lib/date";
import { formatMoney, parseAmount } from "@/lib/finance/money";
import { useT, type MessageKey } from "@/lib/i18n";
import { COINS, coinInfo, holdingsValue } from "@/lib/market/crypto";
import { loadCoinQuotes } from "@/lib/market/refresh";
import { uid, useStore } from "@/lib/state/store";
import type { AccountKind, CoinHolding, Currency, SavingsAccount } from "@/lib/types";
import { holdingDrafts, HTTPS_URL, type HoldingDraft } from "./helpers";

interface AccountForm {
  id: string | null;
  name: string;
  icon: string;
  kind: AccountKind;
  game: string;
  gameName: string;
  gameLogo: string;
  bank: string;
  currency: Currency;
  openingBalance: string;
  holdings: HoldingDraft[];
  pricedAt: string | null;
  goalEnabled: boolean;
  target: string;
  deadline: string;
}

function initialForm(target: SavingsAccount | "new"): AccountForm {
  if (target === "new") {
    return {
      id: null,
      name: "",
      icon: ICON_CHOICES[0],
      kind: "card",
      game: GAMES[0].id,
      gameName: "",
      gameLogo: "",
      bank: "",
      currency: "UAH",
      openingBalance: "",
      holdings: [],
      pricedAt: null,
      goalEnabled: false,
      target: "",
      deadline: "",
    };
  }
  return {
    id: target.id,
    name: target.name,
    icon: target.icon,
    kind: target.kind,
    game: target.game ?? GAMES[0].id,
    gameName: target.gameName ?? "",
    gameLogo: target.gameLogo ?? "",
    bank: target.bank ?? "",
    currency: target.currency,
    openingBalance: String(target.openingBalance),
    holdings: holdingDrafts(target.holdings),
    pricedAt: target.pricedAt ?? null,
    goalEnabled: target.goal != null,
    target: target.goal ? String(target.goal.target) : "",
    deadline: target.goal?.deadline ?? "",
  };
}

/** Add or edit an account: bank, game or coin holdings, opening balance and an optional goal. */
export function AccountSheet({
  target,
  onClose,
  onDelete,
  onReconcile,
  onPriceError,
}: {
  target: SavingsAccount | "new";
  onClose: () => void;
  onDelete: (id: string) => void;
  onReconcile: (id: string) => void;
  onPriceError: (message: string) => void;
}) {
  const { state, update } = useStore();
  const { t } = useT();
  const [form, setForm] = useState<AccountForm>(() => initialForm(target));
  const [coinLoading, setCoinLoading] = useState(false);
  const [coinError, setCoinError] = useState<string | null>(null);
  const kindLabel = (kind: AccountKind) => t(`accountKind.${kind}`);

  const setKind = (kind: AccountKind) => {
    const toCrypto = kind === "crypto" && form.kind !== "crypto";
    setForm({
      ...form,
      kind,
      icon: toCrypto && form.icon === ICON_CHOICES[0] ? "🪙" : form.icon,
      currency: toCrypto && form.currency === "UAH" ? "USD" : form.currency,
      bank: kind === "crypto" && brandInfo(form.bank)?.group === "ua-bank" ? "" : form.bank,
      holdings: toCrypto && form.holdings.length === 0 ? [{ key: uid(), coin: COINS[0].id, quantity: "" }] : form.holdings,
    });
  };

  const setHolding = (key: string, patch: Partial<HoldingDraft>) =>
    setForm((f) => ({ ...f, holdings: f.holdings.map((h) => (h.key === key ? { ...h, ...patch } : h)) }));

  const addHolding = () =>
    setForm((f) => {
      const used = new Set(f.holdings.map((h) => h.coin));
      const next = COINS.find((c) => !used.has(c.id));
      return next ? { ...f, holdings: [...f.holdings, { key: uid(), coin: next.id, quantity: "" }] } : f;
    });

  const removeHolding = (key: string) => setForm((f) => ({ ...f, holdings: f.holdings.filter((h) => h.key !== key) }));

  const priceDrafts = async (f: AccountForm): Promise<AccountForm> => {
    const errors: string[] = [];
    const quotes = await loadCoinQuotes(
      f.holdings.map((h) => ({ coin: h.coin, currency: f.currency })),
      errors,
    );
    if (quotes.size === 0) throw new Error(errors[0] ?? t("balance.prices.none"));
    return {
      ...f,
      pricedAt: new Date().toISOString(),
      holdings: f.holdings.map((h) => {
        const quote = quotes.get(`${f.currency}:${h.coin}`);
        return quote ? { ...h, price: quote.price, icon: quote.icon ?? h.icon } : h;
      }),
    };
  };

  const loadPrices = async () => {
    if (form.holdings.length === 0) return;
    setCoinLoading(true);
    setCoinError(null);
    try {
      const priced = await priceDrafts(form);
      setForm((f) => ({
        ...f,
        pricedAt: priced.pricedAt,
        holdings: f.holdings.map((h) => {
          const p = priced.holdings.find((x) => x.coin === h.coin);
          return p?.price ? { ...h, price: p.price, icon: p.icon } : h;
        }),
      }));
    } catch (err) {
      setCoinError(err instanceof Error ? err.message : t("balance.prices.cryptoFailed"));
    } finally {
      setCoinLoading(false);
    }
  };

  const problem: string | null = (() => {
    if (!form.name.trim()) return t("balance.acc.problem.name");
    const opening = parseAmount(form.openingBalance.trim() === "" ? "0" : form.openingBalance);
    if (!Number.isFinite(opening)) return t("balance.acc.problem.opening");
    if (form.kind === "crypto") {
      for (const h of form.holdings) {
        const q = parseAmount(h.quantity);
        if (!Number.isFinite(q) || q <= 0) return t("balance.crypto.problem.amount", { coin: coinInfo(h.coin)?.symbol ?? h.coin });
      }
    }
    if (form.kind === "skins" && form.game === CUSTOM_GAME_ID) {
      if (!form.gameName.trim()) return t("balance.acc.problem.gameName");
      if (form.gameLogo.trim() && !HTTPS_URL.test(form.gameLogo.trim())) return t("balance.acc.problem.gameLogo");
    }
    if (form.goalEnabled) {
      const goalTarget = parseAmount(form.target);
      if (!Number.isFinite(goalTarget) || goalTarget <= 0) return t("balance.acc.problem.goal");
    }
    return null;
  })();

  const submit = async () => {
    if (problem) return;
    const crypto = form.kind === "crypto";
    const original = form.id ? state.savings.find((a) => a.id === form.id) : undefined;
    const currencyChanged = original !== undefined && original.currency !== form.currency;
    let next = currencyChanged ? { ...form, holdings: form.holdings.map((h) => ({ ...h, price: undefined })) } : form;
    if (crypto && next.holdings.some((h) => h.price === undefined)) {
      setCoinLoading(true);
      try {
        next = await priceDrafts(next);
      } catch (err) {
        onPriceError(err instanceof Error ? err.message : t("balance.prices.cryptoFailed"));
      } finally {
        setCoinLoading(false);
      }
    }
    const goal: SavingsAccount["goal"] = next.goalEnabled
      ? { target: parseAmount(next.target), deadline: next.deadline || undefined }
      : undefined;
    const skins = next.kind === "skins";
    const custom = skins && next.game === CUSTOM_GAME_ID;
    const holdings: CoinHolding[] | undefined = crypto
      ? next.holdings.map((h) => ({ coin: h.coin, quantity: parseAmount(h.quantity), price: h.price, icon: h.icon }))
      : undefined;
    const fields = {
      name: next.name.trim(),
      icon: next.icon,
      kind: next.kind,
      game: skins ? next.game : undefined,
      gameName: custom ? next.gameName.trim() : undefined,
      gameLogo: custom && next.gameLogo.trim() ? next.gameLogo.trim() : undefined,
      bank: BANKABLE_KINDS.has(next.kind) && next.bank ? next.bank : undefined,
      currency: next.currency,
      openingBalance: parseAmount(next.openingBalance.trim() === "" ? "0" : next.openingBalance),
      holdings: holdings?.length ? holdings : undefined,
      pricedAt: crypto ? (next.pricedAt ?? undefined) : undefined,
      goal,
    };
    if (next.id) {
      const id = next.id;
      update((s) => ({ ...s, savings: s.savings.map((a) => (a.id === id ? { ...a, ...fields } : a)) }));
    } else {
      update((s) => ({ ...s, savings: [...s.savings, { id: uid(), ...fields }] }));
    }
    onClose();
  };

  const brand = brandInfo(form.bank);

  return (
    <Sheet
      open
      onClose={onClose}
      onSubmit={() => void submit()}
      problem={problem}
      title={form.id ? t("balance.acc.edit") : t("balance.acc.new")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={problem !== null || coinLoading}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <Field label={t("common.name")}>
        <TextInput
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={t("balance.acc.namePlaceholder")}
        />
      </Field>
      <Field label={t("balance.acc.kind")}>
        <Select value={form.kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
          {ACCOUNT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.icon} {kindLabel(k.value)}
            </option>
          ))}
        </Select>
      </Field>
      {BANKABLE_KINDS.has(form.kind) && (
        <Field label={t("balance.acc.bank")} hint={t("balance.acc.bank.hint")}>
          <div className="flex items-center gap-2">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-field bg-ghost">
              {brand ? (
                <RemoteLogo sources={brandLogoSources(form.bank)} fallback={<Monogram name={brand.name} color={brand.color} />} />
              ) : (
                <span className="text-lg">{form.icon}</span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <Select value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}>
                <option value="">{t("balance.acc.noBank")}</option>
                {(form.kind === "crypto" ? (["crypto", "fintech"] as const) : BRAND_GROUP_ORDER).map((group) => (
                  <optgroup key={group} label={t(BRAND_GROUP_LABEL_KEY[group] as MessageKey)}>
                    {BRANDS.filter((b) => b.group === group).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </div>
          </div>
        </Field>
      )}
      {form.kind === "skins" && (
        <>
          <Field label={t("balance.acc.game")} hint={t("balance.acc.game.hint")}>
            <div className="flex items-center gap-2">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-field bg-ghost">
                <RemoteLogo
                  sources={gameLogoSources(form.game, form.gameLogo.trim())}
                  fallback={<Icon name="gamepad" size={20} className="text-ink-3" />}
                  rounded="md"
                  size={30}
                />
              </span>
              <div className="min-w-0 flex-1">
                <Select value={form.game} onChange={(e) => setForm({ ...form, game: e.target.value })}>
                  {GAMES.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                  <option value={CUSTOM_GAME_ID}>{t("balance.acc.game.custom")}</option>
                </Select>
              </div>
            </div>
          </Field>
          {form.game === CUSTOM_GAME_ID && (
            <>
              <Field label={t("balance.acc.game.name")}>
                <TextInput
                  value={form.gameName}
                  maxLength={60}
                  onChange={(e) => setForm({ ...form, gameName: e.target.value })}
                  placeholder="Escape from Tarkov"
                />
              </Field>
              <Field label={t("balance.acc.game.logo")} hint={t("balance.acc.game.logo.hint")}>
                <TextInput
                  value={form.gameLogo}
                  onChange={(e) => setForm({ ...form, gameLogo: e.target.value })}
                  placeholder="https://…"
                />
              </Field>
            </>
          )}
        </>
      )}
      {!(BANKABLE_KINDS.has(form.kind) && brand) && !(form.kind === "skins" && form.game !== CUSTOM_GAME_ID) && (
        <FieldSet label={t("balance.acc.icon")} hint={t("balance.acc.icon.hint")}>
          <OptionChips
            label={t("common.icon")}
            size="lg"
            options={ICON_CHOICES.map((icon) => ({ value: icon, label: icon }))}
            value={form.icon}
            onChange={(icon) => setForm({ ...form, icon })}
          />
        </FieldSet>
      )}
      <FieldSet label={t("common.currency")}>
        <SegmentedControl
          label={t("common.currency")}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          value={form.currency}
          onChange={(v) => setForm({ ...form, currency: v })}
        />
      </FieldSet>
      {form.kind === "crypto" && (
        <FieldSet label={t("balance.crypto.coins")} hint={t("balance.crypto.coins.hint", { currency: form.currency })}>
          <div className="space-y-2">
            {form.holdings.length === 0 && (
              <p className="rounded-field bg-ghost px-3.5 py-3 text-sm text-ink-3">{t("balance.crypto.noCoins")}</p>
            )}
            {form.holdings.map((h) => {
              const info = coinInfo(h.coin);
              const used = new Set(form.holdings.filter((x) => x.key !== h.key).map((x) => x.coin));
              const qty = parseAmount(h.quantity);
              const value = h.price && Number.isFinite(qty) && qty > 0 ? qty * h.price : null;
              return (
                <div key={h.key} className="rounded-field border border-hairline p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ghost">
                      <RemoteLogo
                        sources={h.icon ? [h.icon] : []}
                        fallback={<span className="text-[11px] font-bold text-ink-2">{info?.symbol ?? "?"}</span>}
                        alt={info?.name ?? h.coin}
                      />
                    </span>
                    <div className="min-w-0 flex-[1_1_11rem]">
                      <Select
                        aria-label={t("balance.crypto.coin")}
                        value={h.coin}
                        onChange={(e) => setHolding(h.key, { coin: e.target.value, price: undefined, icon: undefined })}
                      >
                        {COINS.filter((c) => c.id === h.coin || !used.has(c.id)).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.symbol} — {c.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex min-w-0 flex-[1_1_8rem] items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <TextInput
                          inputMode="decimal"
                          aria-label={t("balance.crypto.amount")}
                          value={h.quantity}
                          onChange={(e) => setHolding(h.key, { quantity: e.target.value })}
                          placeholder={t("balance.crypto.amount")}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeHolding(h.key)}
                        aria-label={t("balance.crypto.remove", { coin: info?.symbol ?? h.coin })}
                        className="icon-btn icon-btn-danger size-10 shrink-0 text-ink-3"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                  {value !== null && (
                    <p className="tnum caption mt-1.5 px-1">
                      {t("balance.crypto.worth", {
                        value: formatMoney(value, form.currency, { exact: true }),
                        price: formatMoney(h.price!, form.currency, { exact: true }),
                      })}
                    </p>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={addHolding} disabled={form.holdings.length >= COINS.length}>
                <Icon name="plus" size={14} />
                {t("balance.crypto.addCoin")}
              </Button>
              {form.holdings.length > 0 && (
                <Button variant="ghost" size="sm" disabled={coinLoading} onClick={() => void loadPrices()}>
                  <Icon name="refresh" size={14} className={coinLoading ? "animate-spin" : ""} />
                  {coinLoading ? t("common.loading") : t("balance.crypto.loadPrices")}
                </Button>
              )}
            </div>
            {form.holdings.some((h) => h.price) && (
              <p className="tnum px-0.5 text-sm text-ink-2">
                {t("balance.crypto.total", {
                  value: formatMoney(
                    holdingsValue(form.holdings.map((h) => ({ coin: h.coin, quantity: parseAmount(h.quantity) || 0, price: h.price }))),
                    form.currency,
                    { exact: true },
                  ),
                })}
                {form.pricedAt && <span className="text-xs text-ink-3"> · {formatDateTime(form.pricedAt)}</span>}
              </p>
            )}
            {coinError && <p className="text-xs text-expense">{coinError}</p>}
          </div>
        </FieldSet>
      )}
      <Field
        label={form.kind === "crypto" ? t("balance.crypto.cash") : t("balance.acc.opening")}
        hint={form.kind === "crypto" ? t("balance.crypto.cash.hint") : t("balance.acc.opening.hint")}
      >
        <TextInput
          inputMode="decimal"
          prefix={CURRENCY_SYMBOL[form.currency]}
          value={form.openingBalance}
          onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
          placeholder="0"
        />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <span className="body-strong">{t("balance.goal")}</span>
        <Switch checked={form.goalEnabled} onChange={(v) => setForm({ ...form, goalEnabled: v })} label={t("balance.goal")} />
      </div>
      {form.goalEnabled && (
        <>
          <Field label={t("balance.goal.target")}>
            <TextInput
              inputMode="decimal"
              prefix={CURRENCY_SYMBOL[form.currency]}
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
              placeholder="50 000"
            />
          </Field>
          <Field label={t("balance.goal.deadline")} hint={t("common.optional")}>
            <TextInput type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </Field>
        </>
      )}
      {form.id && (
        <div className="flex gap-2">
          {form.kind !== "crypto" && (
            <Button variant="ghost" className="flex-1" onClick={() => onReconcile(form.id!)}>
              {t("balance.acc.reconcile")}
            </Button>
          )}
          <Button variant="danger" className="flex-1" onClick={() => onDelete(form.id!)}>
            {t("common.delete")}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
