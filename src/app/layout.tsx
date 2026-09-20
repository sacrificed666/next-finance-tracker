import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Montserrat } from "next/font/google";
import "./globals.scss";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/shell";
import { LocaleBridge } from "@/components/locale-bridge";
import { isLocale, LOCALE_COOKIE, matchLocale } from "@/lib/i18n/locales";
import type { Locale } from "@/lib/types";

const montserrat = Montserrat({
  subsets: ["latin", "latin-ext", "cyrillic"],
  display: "swap",
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: {
    default: "Finances",
    template: "%s — Finances",
  },
  description:
    "Personal finance dashboard: income, expenses, subscriptions, investments and a wealth forecast across ₴ / $ / €.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1112" },
  ],
};

const themeScript = `(function(){try{var p=localStorage.getItem("finance-tracker:theme")||"dark";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;

async function requestLocale(): Promise<Locale> {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(stored)) return stored;
  const accept = (await headers()).get("accept-language") ?? "";
  return matchLocale(accept.split(",").map((part) => part.split(";")[0].trim()));
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await requestLocale();
  return (
    <html
      lang={locale}
      data-theme="dark"
      suppressHydrationWarning
      className={`${montserrat.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-svh flex-col font-sans">
        <StoreProvider>
          <LocaleBridge initialLocale={locale}>
            <AppShell>{children}</AppShell>
          </LocaleBridge>
        </StoreProvider>
      </body>
    </html>
  );
}
