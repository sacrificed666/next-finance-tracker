import { Monogram, RemoteLogo } from "@/components/ui";
import { INZHUR_LOGO } from "@/lib/catalog/brands";
import { investmentKind } from "@/lib/constants";
import { inzhurFund } from "@/lib/market/inzhur";
import type { Investment } from "@/lib/types";

/** A position's logo: the Inzhur fund's, the coin's, or the emoji for its type. */
export function PositionMark({ inv, size = 22, coinSize = size }: { inv: Investment; size?: number; coinSize?: number }) {
  const fund = inzhurFund(inv.fund);
  const icon = investmentKind(inv.kind).icon;
  if (fund) {
    return (
      <RemoteLogo
        sources={[INZHUR_LOGO]}
        fallback={<Monogram name={fund.name.replace("Inzhur ", "")} color={fund.accent} size={size} />}
        alt={fund.name}
        rounded="md"
        size={size}
      />
    );
  }
  if (inv.kind === "crypto" && inv.coinIcon) return <RemoteLogo sources={[inv.coinIcon]} fallback={icon} size={coinSize} />;
  return <>{icon}</>;
}
