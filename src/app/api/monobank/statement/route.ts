import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { loadMono, MONO_MAX_RANGE_S, monoStatement, MonoError, recordMonoBalance } from "@/lib/server/monobank";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const stored = await loadMono(userId);
  if (!stored) return NextResponse.json({ error: "not-connected" }, { status: 409 });

  const url = new URL(request.url);
  const account = url.searchParams.get("account") ?? "";
  const from = Number(url.searchParams.get("from"));
  const to = Number(url.searchParams.get("to"));
  if (!stored.accounts?.some((a) => a.id === account)) return NextResponse.json({ error: "account" }, { status: 400 });
  if (!Number.isInteger(from) || !Number.isInteger(to) || to <= from || to - from > MONO_MAX_RANGE_S) {
    return NextResponse.json({ error: "range" }, { status: 400 });
  }
  try {
    const items = await monoStatement(userId, stored.token, account, from, to);
    await recordMonoBalance(userId, account, items);
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof MonoError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[api/monobank/statement]", err);
    return NextResponse.json({ error: "unreachable" }, { status: 502 });
  }
}
