import { convert } from "./money";
import type { Currency, Settings, TaxProfile, TaxRegimeId } from "./types";

export const MINIMUM_WAGE_UAH = 8647;
export const LIVING_MINIMUM_UAH = 3328;
export const ESV_MIN_UAH = 1902.34;

export interface TaxComponent {
  id: string;
  labelKey: string;
  ratePct?: number;
  fixedUAH?: number;
}

export interface TaxRegime {
  id: TaxRegimeId;
  labelKey: string;
  shortKey: string;
  hintKey: string;
  ratePct: number;
  fixedUAH: number;
  vatPct: number;
  annualLimitUAH: number;
  components: TaxComponent[];
  editable: boolean;
}

export const TAX_REGIMES: TaxRegime[] = [
  {
    id: "none",
    labelKey: "tax.regime.none",
    shortKey: "tax.regime.none.short",
    hintKey: "tax.regime.none.hint",
    ratePct: 0,
    fixedUAH: 0,
    vatPct: 0,
    annualLimitUAH: 0,
    components: [],
    editable: false,
  },
  {
    id: "fop1",
    labelKey: "tax.regime.fop1",
    shortKey: "tax.regime.fop1.short",
    hintKey: "tax.regime.fop1.hint",
    ratePct: 0,
    fixedUAH: 332.8 + 864.7 + ESV_MIN_UAH,
    vatPct: 0,
    annualLimitUAH: 1_444_049,
    components: [
      { id: "single", labelKey: "tax.part.singleTax", fixedUAH: 332.8 },
      { id: "levy", labelKey: "tax.part.militaryLevy", fixedUAH: 864.7 },
      { id: "esv", labelKey: "tax.part.esv", fixedUAH: ESV_MIN_UAH },
    ],
    editable: false,
  },
  {
    id: "fop2",
    labelKey: "tax.regime.fop2",
    shortKey: "tax.regime.fop2.short",
    hintKey: "tax.regime.fop2.hint",
    ratePct: 0,
    fixedUAH: 1729.4 + 864.7 + ESV_MIN_UAH,
    vatPct: 0,
    annualLimitUAH: 7_211_598,
    components: [
      { id: "single", labelKey: "tax.part.singleTax", fixedUAH: 1729.4 },
      { id: "levy", labelKey: "tax.part.militaryLevy", fixedUAH: 864.7 },
      { id: "esv", labelKey: "tax.part.esv", fixedUAH: ESV_MIN_UAH },
    ],
    editable: false,
  },
  {
    id: "fop3",
    labelKey: "tax.regime.fop3",
    shortKey: "tax.regime.fop3.short",
    hintKey: "tax.regime.fop3.hint",
    ratePct: 6,
    fixedUAH: ESV_MIN_UAH,
    vatPct: 0,
    annualLimitUAH: 10_094_049,
    components: [
      { id: "single", labelKey: "tax.part.singleTax", ratePct: 5 },
      { id: "levy", labelKey: "tax.part.militaryLevy", ratePct: 1 },
      { id: "esv", labelKey: "tax.part.esv", fixedUAH: ESV_MIN_UAH },
    ],
    editable: false,
  },
  {
    id: "fop3vat",
    labelKey: "tax.regime.fop3vat",
    shortKey: "tax.regime.fop3vat.short",
    hintKey: "tax.regime.fop3vat.hint",
    ratePct: 4,
    fixedUAH: ESV_MIN_UAH,
    vatPct: 20,
    annualLimitUAH: 10_094_049,
    components: [
      { id: "vat", labelKey: "tax.part.vat", ratePct: 20 },
      { id: "single", labelKey: "tax.part.singleTax", ratePct: 3 },
      { id: "levy", labelKey: "tax.part.militaryLevy", ratePct: 1 },
      { id: "esv", labelKey: "tax.part.esv", fixedUAH: ESV_MIN_UAH },
    ],
    editable: false,
  },
  {
    id: "fop4",
    labelKey: "tax.regime.fop4",
    shortKey: "tax.regime.fop4.short",
    hintKey: "tax.regime.fop4.hint",
    ratePct: 0,
    fixedUAH: 864.7 + ESV_MIN_UAH,
    vatPct: 0,
    annualLimitUAH: 0,
    components: [
      { id: "levy", labelKey: "tax.part.militaryLevy", fixedUAH: 864.7 },
      { id: "esv", labelKey: "tax.part.esv", fixedUAH: ESV_MIN_UAH },
    ],
    editable: false,
  },
  {
    id: "general",
    labelKey: "tax.regime.general",
    shortKey: "tax.regime.general.short",
    hintKey: "tax.regime.general.hint",
    ratePct: 45,
    fixedUAH: 0,
    vatPct: 0,
    annualLimitUAH: 0,
    components: [
      { id: "pit", labelKey: "tax.part.pit", ratePct: 18 },
      { id: "levy", labelKey: "tax.part.militaryLevy", ratePct: 5 },
      { id: "esv", labelKey: "tax.part.esvPct", ratePct: 22 },
    ],
    editable: false,
  },
  {
    id: "custom",
    labelKey: "tax.regime.custom",
    shortKey: "tax.regime.custom.short",
    hintKey: "tax.regime.custom.hint",
    ratePct: 6,
    fixedUAH: ESV_MIN_UAH,
    vatPct: 0,
    annualLimitUAH: 0,
    components: [],
    editable: true,
  },
];

const REGIME_BY_ID = new Map(TAX_REGIMES.map((r) => [r.id, r]));

export function taxRegime(id: TaxRegimeId | undefined): TaxRegime {
  return REGIME_BY_ID.get(id ?? "fop3") ?? TAX_REGIMES[3];
}

export const DEFAULT_TAX_PROFILE: TaxProfile = {
  regime: "fop3",
  ratePct: 6,
  fixedUAH: ESV_MIN_UAH,
  vatPct: 0,
  label: "",
};

export function profileFromRegime(id: TaxRegimeId, previous?: TaxProfile): TaxProfile {
  const regime = taxRegime(id);
  if (regime.editable) {
    return {
      regime: id,
      ratePct: previous?.ratePct ?? regime.ratePct,
      fixedUAH: previous?.fixedUAH ?? regime.fixedUAH,
      vatPct: previous?.vatPct ?? regime.vatPct,
      label: previous?.label ?? "",
    };
  }
  return {
    regime: id,
    ratePct: regime.ratePct,
    fixedUAH: regime.fixedUAH,
    vatPct: regime.vatPct,
    label: "",
  };
}

export interface TaxBreakdown {
  gross: number;
  vat: number;
  taxable: number;
  percentPart: number;
  fixedPart: number;
  total: number;
  net: number;
  effectivePct: number;
}

export function taxBreakdown(
  gross: number,
  currency: Currency,
  profile: TaxProfile,
  settings: Settings,
): TaxBreakdown {
  const vatPct = profile.vatPct ?? 0;
  const vat = vatPct > 0 ? gross - gross / (1 + vatPct / 100) : 0;
  const taxable = gross - vat;
  const percentPart = (taxable * profile.ratePct) / 100;
  const fixedPart = convert(profile.fixedUAH, "UAH", currency, settings.rates);
  const total = vat + percentPart + fixedPart;
  const net = gross - total;
  return {
    gross,
    vat,
    taxable,
    percentPart,
    fixedPart,
    total,
    net,
    effectivePct: gross > 0 ? (total / gross) * 100 : 0,
  };
}

export function taxedNet(
  gross: number,
  currency: Currency,
  profile: TaxProfile,
  settings: Settings,
): number {
  return taxBreakdown(gross, currency, profile, settings).net;
}

export function grossFromNet(
  net: number,
  currency: Currency,
  profile: TaxProfile,
  settings: Settings,
): number {
  const fixedPart = convert(profile.fixedUAH, "UAH", currency, settings.rates);
  const vatPct = profile.vatPct ?? 0;
  const keepRate = (1 - profile.ratePct / 100) / (1 + vatPct / 100);
  if (keepRate <= 0) return NaN;
  return (net + fixedPart) / keepRate;
}

export function regimeAnnualHeadroom(
  id: TaxRegimeId,
  grossThisYearUAH: number,
): { limit: number; used: number; remaining: number; pct: number } | null {
  const limit = taxRegime(id).annualLimitUAH;
  if (limit <= 0) return null;
  const used = Math.max(0, grossThisYearUAH);
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    pct: Math.min(100, (used / limit) * 100),
  };
}
