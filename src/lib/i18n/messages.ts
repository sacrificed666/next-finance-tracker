import type { Locale } from "../types";

export type Messages = Record<string, string>;

const LOADERS: Record<Locale, () => Promise<Messages>> = {
  en: () => import("./dict/en").then((m) => m.en),
  uk: () => import("./dict/uk").then((m) => m.uk),
  de: () => import("./dict/de").then((m) => m.de),
  fr: () => import("./dict/fr").then((m) => m.fr),
  es: () => import("./dict/es").then((m) => m.es),
  pl: () => import("./dict/pl").then((m) => m.pl),
  it: () => import("./dict/it").then((m) => m.it),
  nl: () => import("./dict/nl").then((m) => m.nl),
};

const loaded = new Map<Locale, Messages>();

export function cachedMessages(locale: Locale): Messages | undefined {
  return loaded.get(locale);
}

export function rememberMessages(locale: Locale, messages: Messages): void {
  loaded.set(locale, messages);
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  const known = loaded.get(locale);
  if (known) return known;
  const messages = await LOADERS[locale]();
  loaded.set(locale, messages);
  return messages;
}
