import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const limit = rateLimit(clientKey(request, `password:${id}`), 10, 15 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts — try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: { current?: string; next?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const weak = passwordProblem(String(body.next ?? ""));
  if (weak) return NextResponse.json({ error: weak }, { status: 400 });

  const pool = getPool();
  const res = await pool.query<{ password_hash: string | null }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [id],
  );
  const stored = res.rows[0]?.password_hash ?? null;

  if (stored) {
    const ok = await verifyPassword(String(body.current ?? ""), stored);
    if (!ok) {
      return NextResponse.json({ error: "That is not your current password." }, { status: 403 });
    }
  }

  await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
    id,
    await hashPassword(String(body.next)),
  ]);
  return NextResponse.json({ ok: true });
}
