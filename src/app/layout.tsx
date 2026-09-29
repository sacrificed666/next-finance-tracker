import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Montserrat } from "next/font/google";
import "./globals.scss";
import { StoreProvider } from "@/lib/state/store";
import { LocaleBridge } from "@/components/providers/locale-bridge";
import { ServiceWorker } from "@/components/providers/service-worker";
import { requestLocale, serverMessages } from "@/lib/i18n/server";

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
  applicationName: "Finances",
  appleWebApp: { capable: true, title: "Finances", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1112" },
  ],
};

const themeScript = `(function(){try{var p=localStorage.getItem("finance-tracker:theme")||"dark";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await requestLocale();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang={locale}
      data-theme="dark"
      suppressHydrationWarning
      className={`${montserrat.variable} h-full antialiased`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-svh flex-col font-sans">
        <div className="app-backdrop" aria-hidden />
        <div className="orb-b" aria-hidden />
        <ServiceWorker />
        <StoreProvider>
          <LocaleBridge initialLocale={locale} initialMessages={serverMessages(locale)}>
            {children}
          </LocaleBridge>
        </StoreProvider>
      </body>
    </html>
  );
}
