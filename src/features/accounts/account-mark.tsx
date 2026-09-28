"use client";

import { Monogram, RemoteLogo } from "@/components/ui";
import { brandInfo, brandLogoSources } from "@/lib/catalog/brands";
import { gameLabel, gameLogoSources } from "@/lib/catalog/games";
import type { SavingsAccount } from "@/lib/types";

/** Game logo, bank logo, coin icon or the account's emoji — whichever is known. */
export function AccountMark({ acc }: { acc: SavingsAccount }) {
  if (acc.kind === "skins") {
    return (
      <RemoteLogo
        sources={gameLogoSources(acc.game, acc.gameLogo)}
        fallback={acc.icon}
        alt={gameLabel(acc.game, acc.gameName) ?? ""}
        rounded="md"
        size={30}
      />
    );
  }
  const brand = brandInfo(acc.bank);
  if (brand) {
    return (
      <RemoteLogo
        sources={brandLogoSources(brand.id)}
        fallback={<Monogram name={brand.name} color={brand.color} />}
        alt={brand.name}
      />
    );
  }
  const coinIcon = acc.kind === "crypto" ? acc.holdings?.find((h) => h.icon)?.icon : undefined;
  if (coinIcon) return <RemoteLogo sources={[coinIcon]} fallback={acc.icon} />;
  return <>{acc.icon}</>;
}
