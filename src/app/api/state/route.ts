import { NextResponse } from "next/server";
import { loadState, saveState } from "@/lib/repo";

// always hit Postgres — never prerender or cache this endpoint
export const dynamic = "force-dynamic";

function fail(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : "Unexpected database error";
  console.error("[api/state]", err);
  return NextResponse.json({ error: message }, { status });
}

/** GET /api/state — the whole dataset assembled from the normalized tables */
export async function GET() {
  try {
    return NextResponse.json(await loadState());
  } catch (err) {
    return fail(err);
  }
}

/** PUT /api/state — replaces the dataset (validated server-side before writing) */
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }
  try {
    // saveState runs the payload through normalizeState, so malformed rows are
    // dropped rather than written
    await saveState(body as never);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
