import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, reviews, feedback } from "@/db/schema";
import { ensureDatabaseReady } from "@/db/seed";
import { eq, desc, and } from "drizzle-orm";
import { verifyToken } from "@/lib/auth-server";
import { rateLimit, sanitizeText } from "@/lib/security";

/**
 * Feedback inbox + public reviews wall.
 * Reviews stay "pending" until an admin approves them, then they show to everyone.
 */

async function getPlayerByToken(token: unknown) {
  const id = verifyToken(token);
  if (!id) return null;
  const rows = await db.select().from(players).where(eq(players.id, id)).limit(1);
  return rows[0] || null;
}

export async function GET(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(req.url);

    if (searchParams.get("admin") === "1") {
      const me = await getPlayerByToken(searchParams.get("token"));
      if (!me?.isAdmin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
      const pending = await db.select().from(reviews).where(eq(reviews.status, "pending")).orderBy(desc(reviews.createdAt)).limit(100);
      const inbox = await db.select().from(feedback).orderBy(desc(feedback.createdAt)).limit(100);
      return NextResponse.json({
        pending: pending.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() })),
        feedback: inbox.map((f) => ({ ...f, createdAt: new Date(f.createdAt).toISOString() })),
      });
    }

    const approved = await db
      .select()
      .from(reviews)
      .where(eq(reviews.status, "approved"))
      .orderBy(desc(reviews.createdAt))
      .limit(60);

    const avg = approved.length
      ? Math.round((approved.reduce((s, r) => s + r.rating, 0) / approved.length) * 10) / 10
      : 0;

    // my pending review (so the UI can say "waiting for approval")
    let myPending: object | null = null;
    const me = await getPlayerByToken(searchParams.get("token"));
    if (me) {
      const mine = await db
        .select()
        .from(reviews)
        .where(and(eq(reviews.playerId, me.id), eq(reviews.status, "pending")))
        .orderBy(desc(reviews.createdAt))
        .limit(1);
      if (mine[0]) myPending = { ...mine[0], createdAt: new Date(mine[0].createdAt).toISOString() };
    }

    return NextResponse.json({
      reviews: approved.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() })),
      avgRating: avg,
      totalApproved: approved.length,
      myPending,
    });
  } catch (error) {
    console.error("GET /api/community error:", error);
    return NextResponse.json({ reviews: [], avgRating: 0, totalApproved: 0 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await req.json().catch(() => ({}));
    const me = await getPlayerByToken(body.token);

    if (body.action === "submit_feedback") {
      const message = sanitizeText(body.message, 1000);
      if (message.length < 4) return NextResponse.json({ error: "Please write a little more!" }, { status: 400 });
      const kind = ["bug", "idea", "praise", "other"].includes(body.kind) ? body.kind : "other";
      const username = me?.username || sanitizeText(body.username || "Guest", 20) || "Guest";
      const rl = rateLimit(`fb:${username}`, 5, 600000);
      if (!rl.ok) return NextResponse.json({ error: "Thanks! Please wait a bit before sending more." }, { status: 429 });
      await db.insert(feedback).values({ playerId: me?.id ?? null, username, kind, message });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "submit_review") {
      if (!me) return NextResponse.json({ error: "Create a free account to leave a review." }, { status: 401 });
      const rating = Math.max(1, Math.min(5, Number(body.rating || 0)));
      const comment = sanitizeText(body.comment, 280);
      if (!rating || comment.length < 3) {
        return NextResponse.json({ error: "Pick a star rating and write a short comment." }, { status: 400 });
      }
      const existing = await db
        .select()
        .from(reviews)
        .where(and(eq(reviews.playerId, me.id), eq(reviews.status, "pending")))
        .limit(1);
      if (existing[0]) {
        return NextResponse.json({ error: "Your previous review is still waiting for approval." }, { status: 409 });
      }
      const [row] = await db
        .insert(reviews)
        .values({ playerId: me.id, username: me.username, rating, comment, status: "pending" })
        .returning();
      return NextResponse.json({ ok: true, review: { ...row, createdAt: new Date(row.createdAt).toISOString() } });
    }

    if (body.action === "moderate_review") {
      if (!me?.isAdmin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
      const id = Number(body.id);
      const decision = String(body.decision || "");
      if (!id) return NextResponse.json({ error: "Missing review id" }, { status: 400 });
      if (decision === "delete") {
        await db.delete(reviews).where(eq(reviews.id, id));
      } else if (decision === "approve" || decision === "reject") {
        await db.update(reviews).set({ status: decision === "approve" ? "approved" : "rejected" }).where(eq(reviews.id, id));
      } else {
        return NextResponse.json({ error: "Unknown decision" }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete_feedback") {
      if (!me?.isAdmin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
      await db.delete(feedback).where(eq(feedback.id, Number(body.id)));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/community error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
