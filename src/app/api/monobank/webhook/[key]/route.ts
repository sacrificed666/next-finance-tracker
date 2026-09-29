import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { absorbOperation, candidateFromMono } from "@/lib/finance/import";
import { findMonoByWebhookKey, isMonoItem, monoDate, parseMonoItem } from "@/lib/server/monobank";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";
import { loadState, saveChanges } from "@/lib/server/repo";
import { diffState } from "@/lib/state/changes";

export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse(null, { status: 200 });
}

const queues = new Map<string, Promise<unknown>>();

function inTurn<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(userId) ?? Promise.resolve();
  const next = previous.then(work, work);
  queues.set(
    userId,
    next.catch(() => {}).finally(() => {
      if (queues.get(userId) === next) queues.delete(userId);
    }),
  );
  return next;
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!rateLimit(clientKey(request, "mono-webhook"), 120, 60_000).allowed) {
    return NextResponse.json({ error: "slow down" }, { status: 429 });
  }
  const { key } = await params;
  const found = await findMonoByWebhookKey(key);
  if (!found) return NextResponse.json({ error: "unknown" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as {
    type?: unknown;
    data?: { account?: unknown; statementItem?: unknown };
  } | null;
  if (body?.type !== "StatementItem" || !isMonoItem(body.data?.statementItem)) return NextResponse.json({ ok: true });
  const account = found.stored.accounts?.find((a) => a.id === body.data?.account);
  if (!account?.currency) return NextResponse.json({ ok: true });
  const item = parseMonoItem(body.data.statementItem);
  const currency = account.currency;

  try {
    await inTurn(found.userId, async () => {
      const { state } = await loadState(found.userId);
      const linked = state.settings.bankLinks?.[account.id];
      if (!linked) return;
      const candidate = candidateFromMono(state, item, currency, linked, monoDate(item.time));
      const next = absorbOperation(state, candidate, randomUUID);
      if (next !== state) await saveChanges(found.userId, diffState(state, next), null);
    });
  } catch (err) {
    console.error("[api/monobank/webhook]", err);
    return NextResponse.json({ error: "not saved" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
