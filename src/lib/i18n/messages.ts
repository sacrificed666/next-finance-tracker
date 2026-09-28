import type { Locale } from "../types";

/** One language's strings: every key of the English dictionary, plus plural forms some languages add. */
export type Messages = Record<string, string>;

// Each dictionary is its own chunk. The server hands the page the one it renders in
// (see app/layout.tsx), so a visit downloads a single language instead of all eight;
// the others load only when someone switches to them.
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

/** A dictionary already in memory, if there is one. */
export function cachedMessages(locale: Locale): Messages | undefined {
  return loaded.get(locale);
}

/** Keep a dictionary that arrived another way (from the server) for later switches back. */
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
