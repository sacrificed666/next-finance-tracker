const SYSTEMS: Array<[RegExp, string]> = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg(A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1];
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  if (browser && system) return `${browser} · ${system}`;
  return browser ?? system ?? "";
}

export function clientAddress(forwarded: string | null | undefined, real: string | null | undefined): string {
  return (forwarded ?? "").split(",")[0]?.trim() || real?.trim() || "";
}
