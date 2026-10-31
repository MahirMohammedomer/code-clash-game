"use client";
import { useEffect, useState } from "react";

type Review = { id: number; author: string; rating: number; comment: string };
export default function Feedback() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [author, setAuthor] = useState("");
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/feedback").then(r => r.ok ? r.json() : null).then(d => { if (d) setReviews(d.reviews); }).catch(() => {}); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ author, rating, comment }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setComment(""); setMessage("Thanks! Your review is awaiting approval.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not send feedback."); }
    finally { setBusy(false); }
  }
  return <section className="bg-white rounded-3xl p-5 border-2 border-[#E5E0D5] space-y-4">
    <div><h2 className="text-lg font-black">Help shape the game</h2><p className="text-sm text-slate-600">Share an idea or leave a review. Reviews appear after approval.</p></div>
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-xs font-bold">Rating <select value={rating} onChange={e => setRating(Number(e.target.value))} className="ml-2 rounded-lg bg-slate-100 p-2 text-slate-900">{[5,4,3,2,1].map(n => <option key={n} value={n}>{n} / 5</option>)}</select></label>
      <input aria-label="Your name (optional)" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Your name (optional)" maxLength={30} className="w-full rounded-xl bg-slate-100 p-3 text-sm text-slate-900"/>
      <textarea aria-label="Your feedback" value={comment} onChange={e => setComment(e.target.value)} required maxLength={500} placeholder="What should we improve?" className="w-full rounded-xl bg-slate-100 p-3 text-sm text-slate-900"/>
      <button disabled={busy} className="rounded-xl bg-[#2B2D42] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Sending…" : "Send feedback"}</button>
      {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
    </form>
    {reviews.map(r => <article key={r.id} className="border-t border-slate-200 pt-3"><p className="text-sm font-bold">{r.author} · {r.rating}/5</p><p className="text-sm text-slate-700 break-safe">{r.comment}</p></article>)}
  </section>;
}
