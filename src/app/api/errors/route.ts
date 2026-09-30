import { NextResponse } from "next/server";
import { auth, OWNER_EMAIL } from "@/lib/server/auth";
import { ensureSchema, getPool } from "@/lib/server/db";

export const dynamic = "force-dynamic";

async function refusal(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const email = session.user.email?.toLowerCase();
  if (!OWNER_EMAIL || email !== OWNER_EMAIL) {
    return NextResponse.json({ error: "Only the owner sees server problems." }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const refused = await refusal();
  if (refused) return refused;
  await ensureSchema();
  const res = await getPool().query<{ at: string; route: string; message: string }>(
    `SELECT to_char(at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at, route, message FROM app_errors ORDER BY id DESC LIMIT 30`,
  );
  const total = await getPool().query<{ n: string }>(`SELECT count(*) AS n FROM app_errors`);
  return NextResponse.json({ errors: res.rows, total: Number(total.rows[0]?.n ?? 0) });
}

export async function DELETE() {
  const refused = await refusal();
  if (refused) return refused;
  await ensureSchema();
  await getPool().query(`DELETE FROM app_errors`);
  return NextResponse.json({ ok: true });
}
