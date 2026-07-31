import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/shell";

const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: {
    default: "Finances",
    template: "%s — Finances",
  },
  description:
    "Personal finance dashboard: income, expenses, subscriptions, investments and a wealth forecast across ₴ / $ / €. All data stays on your device.",
};

export const viewport: Viewport = {
  // matches --bg in globals.css, so the browser chrome blends into the page
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f2f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0910" },
  ],
};

// resolves the saved theme before first paint (see docs: preventing-flash-before-hydration);
// dark is the app default — "system" only applies when the user picked it
const themeScript = `(function(){try{var p=localStorage.getItem("finance-tracker:theme")||"dark";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${montserrat.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-svh flex-col font-sans">
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
