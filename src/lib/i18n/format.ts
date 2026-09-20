let activeIntl = "en-GB";

export function setFormatLocale(intl: string): void {
  activeIntl = intl;
}

export function formatLocale(): string {
  return activeIntl;
}
