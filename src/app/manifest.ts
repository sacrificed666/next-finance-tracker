import type { MetadataRoute } from "next";
import { requestLocale, serverT } from "@/lib/i18n/server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await requestLocale();
  const t = serverT(locale);
  return {
    id: "/",
    name: t("app.name"),
    short_name: t("app.name"),
    description: t("pwa.description"),
    lang: locale,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0f1112",
    theme_color: "#0f1112",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: t("dash.addExpense"), url: "/?add=expense", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: t("palette.addIncome"), url: "/income?add=income", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: t("nav.calendar"), url: "/calendar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
