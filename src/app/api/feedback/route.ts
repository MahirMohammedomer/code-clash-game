import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/db";
import { sanitizeText, rateLimit } from "@/lib/security";

export async function GET() {
  try {
    const result = await getPool().query("SELECT id, author, rating, comment, created_at FROM public.feedback WHERE approved = true ORDER BY created_at DESC LIMIT 30");
    return NextResponse.json({ reviews: result.rows });
  } catch { return NextResponse.json({ error: "Feedback is not available yet." }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (!rateLimit(`feedback:${ip}`, 5, 60000).ok) return NextResponse.json({ error: "Please wait before sending more feedback." }, { status: 429 });
    const body = await request.json();
    const author = sanitizeText(body.author, 30) || "Player";
    const comment = sanitizeText(body.comment, 500);
    const rating = Number(body.rating);
    if (!comment || !Number.isInteger(rating) || rating < 1 || rating > 5) return NextResponse.json({ error: "Please add a comment and a rating from 1 to 5." }, { status: 400 });
    await getPool().query("INSERT INTO public.feedback (author, rating, comment) VALUES ($1, $2, $3)", [author, rating, comment]);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not send feedback. Please try again later." }, { status: 503 }); }
}
