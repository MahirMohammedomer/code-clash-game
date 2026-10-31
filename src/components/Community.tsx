"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Bug, Check, Heart, Lightbulb, MessageCircle, MessageSquare, Send,
  ShieldCheck, Star, Trash2, X, Clock,
} from "lucide-react";
import { CharacterAvatar } from "./Character";
import { DEFAULT_AVATAR, normalizeAvatar } from "@/lib/avatar";
import type { FeedbackRow, Player, Review } from "@/lib/types";
import { soundEngine } from "@/lib/sound-effects";

interface LobbyMsg {
  id: number; senderId: number; senderName: string;
  senderAvatar: typeof DEFAULT_AVATAR; content: string; createdAt: string;
}

function Stars({ value, onPick, size = 26 }: { value: number; onPick?: (v: number) => void; size?: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" disabled={!onPick} onClick={() => { onPick?.(i); soundEngine.playTap(600 + i * 60); }}
          className={onPick ? "active:scale-125 transition-transform" : "cursor-default"} aria-label={`${i} stars`}>
          <Star size={size} strokeWidth={2.2}
            style={{ color: i <= value ? "#FFC800" : "var(--border-strong)" }}
            fill={i <= value ? "#FFC800" : "none"} />
        </button>
      ))}
    </span>
  );
}

export default function Community({
  me, token, onBack, showToast, initialTab = "reviews",
}: {
  me: Player;
  token: string | null;
  onBack: () => void;
  showToast: (m: string, k?: "ok" | "err") => void;
  initialTab?: "reviews" | "feedback" | "lobby" | "admin";
}) {
  const [tab, setTab] = useState<"reviews" | "feedback" | "lobby" | "admin">(initialTab);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avg, setAvg] = useState(0);
  const [myPending, setMyPending] = useState<Review | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  const [fbKind, setFbKind] = useState("idea");
  const [fbText, setFbText] = useState("");
  const [fbSent, setFbSent] = useState(false);

  const [lobby, setLobby] = useState<LobbyMsg[]>([]);
  const [lobbyDraft, setLobbyDraft] = useState("");
  const lobbyCursor = useRef(0);
  const lobbyScroll = useRef<HTMLDivElement>(null);

  const [pending, setPending] = useState<Review[]>([]);
  const [inbox, setInbox] = useState<FeedbackRow[]>([]);

  const loadReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/community${token ? `?token=${token}` : ""}`);
      const data = await res.json();
      setReviews(data.reviews || []);
      setAvg(data.avgRating || 0);
      setMyPending(data.myPending || null);
    } catch {}
  }, [token]);

  const loadAdmin = useCallback(async () => {
    if (!token || !me.isAdmin) return;
    try {
      const res = await fetch(`/api/community?admin=1&token=${token}`);
      const data = await res.json();
      setPending(data.pending || []);
      setInbox(data.feedback || []);
    } catch {}
  }, [token, me.isAdmin]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { loadReviews(); }, [loadReviews]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load admin data when tab opens
  useEffect(() => { if (tab === "admin") loadAdmin(); }, [tab, loadAdmin]);

  // lobby polling
  useEffect(() => {
    if (tab !== "lobby") return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/chat?since=${lobbyCursor.current}`);
        const data = await res.json();
        if (!alive) return;
        const msgs: LobbyMsg[] = (data.messages || []).map((m: LobbyMsg) => ({ ...m, senderAvatar: normalizeAvatar(m.senderAvatar) }));
        if (msgs.length) {
          lobbyCursor.current = Math.max(...msgs.map((m) => m.id));
          setLobby((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...msgs.filter((m) => !seen.has(m.id))].slice(-100);
          });
          requestAnimationFrame(() => lobbyScroll.current?.scrollTo({ top: lobbyScroll.current.scrollHeight, behavior: "smooth" }));
        }
      } catch {}
    };
    load();
    const t = setInterval(load, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [tab]);

  const submitReview = async () => {
    if (!token) { showToast("Guests can't review — create a free account first!", "err"); return; }
    setSending(true);
    try {
      const res = await fetch("/api/community", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit_review", token, rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setComment("");
      soundEngine.playReward();
      showToast("Thanks! Your review will appear after approval.");
      loadReviews();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to send review", "err");
    }
    setSending(false);
  };

  const submitFeedback = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/community", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit_feedback", token, username: me.username, kind: fbKind, message: fbText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setFbSent(true);
      setFbText("");
      soundEngine.playReward();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to send", "err");
    }
    setSending(false);
  };

  const sendLobby = async () => {
    if (!token) { showToast("Sign in to chat in the lobby!", "err"); return; }
    const text = lobbyDraft.trim();
    if (!text) return;
    setLobbyDraft("");
    try {
      await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, content: text }),
      });
    } catch {}
  };

  const moderate = async (id: number, decision: string) => {
    await fetch("/api/community", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "moderate_review", token, id, decision }),
    }).catch(() => {});
    setPending((p) => p.filter((r) => r.id !== id));
    loadReviews();
    soundEngine.playTap(800);
  };

  const deleteFeedback = async (id: number) => {
    await fetch("/api/community", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_feedback", token, id }),
    }).catch(() => {});
    setInbox((f) => f.filter((x) => x.id !== id));
  };

  const tabBtn = (id: typeof tab, label: string, Icon: React.ElementType, badge?: number) => (
    <button key={id} onClick={() => { setTab(id); soundEngine.playTap(500); }}
      className={`btn-game px-4 py-2.5 flex items-center gap-1.5 whitespace-nowrap ${tab === id ? "btn-blue" : "btn-ghost"}`}>
      <Icon size={16} strokeWidth={2.6} /> {label}
      {badge ? <span className="ml-1 min-w-[20px] h-5 px-1 rounded-full bg-[#FF4B4B] text-white text-[10px] font-black flex items-center justify-center">{badge}</span> : null}
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-5 pb-16 animate-fade">
      <div className="flex items-center gap-2 py-3 sticky top-0 z-20" style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)", backdropFilter: "blur(10px)" }}>
        <button onClick={onBack} className="btn-game btn-ghost w-10 h-10 !rounded-xl flex items-center justify-center" aria-label="Back">
          <ArrowLeft size={19} strokeWidth={2.8} />
        </button>
        <h2 className="font-display font-bold text-2xl flex-1">Community</h2>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-4">
        {tabBtn("reviews", "Reviews", Star)}
        {tabBtn("feedback", "Send Feedback", MessageSquare)}
        {tabBtn("lobby", "Lobby Chat", MessageCircle)}
        {me.isAdmin && tabBtn("admin", "Admin", ShieldCheck, pending.length)}
      </div>

      {tab === "reviews" && (
        <div className="space-y-4">
          <div className="card-game p-4 flex items-center gap-4">
            <div className="text-center">
              <p className="font-display font-bold text-4xl leading-none">{avg ? avg.toFixed(1) : "—"}</p>
              <p className="text-[11px] font-black" style={{ color: "var(--ink-faint)" }}>average</p>
            </div>
            <div>
              <Stars value={Math.round(avg)} size={22} />
              <p className="text-sm font-bold mt-1" style={{ color: "var(--ink-soft)" }}>
                {reviews.length} approved player review{reviews.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {/* write a review */}
          <div className="card-game p-4">
            <h3 className="font-display font-semibold text-lg">Rate Cipher Clash</h3>
            {myPending ? (
              <div className="mt-2 rounded-xl px-3 py-2.5 flex items-center gap-2 font-bold text-sm" style={{ background: "#FFF3C4", color: "#7A5A00" }}>
                <Clock size={16} /> Your review (“{myPending.comment.slice(0, 40)}...”) is waiting for approval.
              </div>
            ) : (
              <>
                <div className="mt-2"><Stars value={rating} onPick={setRating} /></div>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={280} rows={2}
                  placeholder={token ? "What do you love (or want improved)?" : "Create a free account to leave a review!"}
                  disabled={!token}
                  className="input-game w-full mt-2 px-3 py-2.5 font-bold text-sm resize-none" />
                <button onClick={submitReview} disabled={sending || !token || comment.trim().length < 3} className="btn-game btn-green px-5 py-2.5 mt-2 flex items-center gap-1.5">
                  <Send size={15} strokeWidth={2.7} /> {sending ? "Sending..." : "Submit for approval"}
                </button>
                <p className="text-[11px] font-bold mt-1.5" style={{ color: "var(--ink-faint)" }}>Reviews appear here after the developer approves them.</p>
              </>
            )}
          </div>

          <div className="space-y-2">
            {reviews.length === 0 && (
              <p className="text-center font-bold py-8" style={{ color: "var(--ink-faint)" }}>No reviews yet — be the first to rate the game!</p>
            )}
            {reviews.map((r) => (
              <div key={r.id} className="card-game p-3.5 animate-rise">
                <div className="flex items-center gap-2">
                  <p className="font-display font-semibold flex-1">{r.username}</p>
                  <Stars value={r.rating} size={15} />
                </div>
                <p className="font-bold text-sm mt-1" style={{ color: "var(--ink-soft)" }}>{r.comment}</p>
                <p className="text-[10px] font-bold mt-1" style={{ color: "var(--ink-faint)" }}>{new Date(r.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "feedback" && (
        <div className="card-game p-4 animate-rise">
          <h3 className="font-display font-semibold text-lg">Tell the developer anything!</h3>
          <p className="text-sm font-bold" style={{ color: "var(--ink-soft)" }}>Bugs, ideas, praise — every message is read. Your feedback shapes the next updates.</p>
          {fbSent ? (
            <div className="mt-4 text-center py-6">
              <span className="w-14 h-14 rounded-full inline-flex items-center justify-center text-white mb-2" style={{ background: "#58CC02" }}>
                <Check size={28} strokeWidth={3} />
              </span>
              <p className="font-display font-semibold text-lg">Feedback received — thank you!</p>
              <button onClick={() => setFbSent(false)} className="btn-game btn-ghost px-4 py-2 mt-3 text-sm">Send another</button>
            </div>
          ) : (
            <>
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {[
                  { id: "bug", label: "Bug report", icon: Bug },
                  { id: "idea", label: "Idea", icon: Lightbulb },
                  { id: "praise", label: "Praise", icon: Heart },
                  { id: "other", label: "Other", icon: MessageSquare },
                ].map((k) => {
                  const Icon = k.icon;
                  return (
                    <button key={k.id} onClick={() => setFbKind(k.id)}
                      className={`btn-game px-3.5 py-2 text-sm flex items-center gap-1.5 ${fbKind === k.id ? "btn-purple" : "btn-ghost"}`}>
                      <Icon size={15} strokeWidth={2.6} /> {k.label}
                    </button>
                  );
                })}
              </div>
              <textarea value={fbText} onChange={(e) => setFbText(e.target.value)} maxLength={1000} rows={4}
                placeholder="Describe the bug, share your idea, or just say hi..."
                className="input-game w-full mt-3 px-3 py-2.5 font-bold text-sm resize-none" />
              <button onClick={submitFeedback} disabled={sending || fbText.trim().length < 4} className="btn-game btn-green px-5 py-3 mt-2 flex items-center gap-1.5">
                <Send size={15} strokeWidth={2.7} /> {sending ? "Sending..." : "Send feedback"}
              </button>
            </>
          )}
        </div>
      )}

      {tab === "lobby" && (
        <div className="card-game flex flex-col animate-rise" style={{ height: "min(62dvh, 560px)" }}>
          <div ref={lobbyScroll} className="flex-1 overflow-y-auto pretty-scroll p-3 space-y-2.5">
            {lobby.length === 0 && (
              <p className="text-center font-bold py-10 text-sm" style={{ color: "var(--ink-faint)" }}>The lobby is quiet... say hello, champion!</p>
            )}
            {lobby.map((m) => (
              <div key={m.id} className="flex gap-2 items-start">
                <CharacterAvatar config={m.senderAvatar} size={34} ringWidth={2} />
                <div className="min-w-0">
                  <p className="text-[11px] font-black" style={{ color: "var(--ink-soft)" }}>{m.senderName}</p>
                  <div className="rounded-2xl rounded-tl-md px-3 py-1.5 font-bold text-sm inline-block" style={{ background: "var(--surface-3)" }}>{m.content}</div>
                </div>
              </div>
            ))}
          </div>
          <form className="p-3 flex gap-2 border-t-2" style={{ borderColor: "var(--border)" }}
            onSubmit={(e) => { e.preventDefault(); sendLobby(); }}>
            <input value={lobbyDraft} onChange={(e) => setLobbyDraft(e.target.value)} maxLength={220}
              placeholder={token ? "Message the lobby..." : "Sign in to chat"}
              disabled={!token} className="input-game flex-1 px-3 py-2.5 font-bold text-sm" />
            <button type="submit" disabled={!token} className="btn-game btn-blue px-4 flex items-center"><Send size={16} strokeWidth={2.6} /></button>
          </form>
        </div>
      )}

      {tab === "admin" && me.isAdmin && (
        <div className="space-y-5 animate-rise">
          <div>
            <h3 className="font-display font-semibold text-lg mb-2">Pending reviews ({pending.length})</h3>
            {pending.length === 0 && <p className="font-bold text-sm" style={{ color: "var(--ink-faint)" }}>Nothing waiting. Clean inbox!</p>}
            <div className="space-y-2">
              {pending.map((r) => (
                <div key={r.id} className="card-game p-3.5">
                  <div className="flex items-center gap-2">
                    <p className="font-display font-semibold flex-1">{r.username}</p>
                    <Stars value={r.rating} size={15} />
                  </div>
                  <p className="font-bold text-sm mt-1" style={{ color: "var(--ink-soft)" }}>{r.comment}</p>
                  <div className="flex gap-1.5 mt-2.5">
                    <button onClick={() => moderate(r.id, "approve")} className="btn-game btn-green px-3.5 py-2 text-xs flex items-center gap-1"><Check size={14} strokeWidth={3} /> Approve</button>
                    <button onClick={() => moderate(r.id, "reject")} className="btn-game btn-ghost px-3.5 py-2 text-xs flex items-center gap-1"><X size={14} strokeWidth={3} /> Reject</button>
                    <button onClick={() => moderate(r.id, "delete")} className="btn-game btn-red px-3.5 py-2 text-xs flex items-center gap-1"><Trash2 size={14} strokeWidth={2.7} /> Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-display font-semibold text-lg mb-2">Feedback inbox ({inbox.length})</h3>
            {inbox.length === 0 && <p className="font-bold text-sm" style={{ color: "var(--ink-faint)" }}>No feedback yet.</p>}
            <div className="space-y-2">
              {inbox.map((f) => (
                <div key={f.id} className="card-game p-3.5 flex gap-3">
                  <span className="chip h-fit px-2 py-1 text-[10px] font-black uppercase shrink-0">{f.kind}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-xs" style={{ color: "var(--ink-soft)" }}>{f.username} · {new Date(f.createdAt).toLocaleString()}</p>
                    <p className="font-bold text-sm mt-0.5 whitespace-pre-wrap">{f.message}</p>
                  </div>
                  <button onClick={() => deleteFeedback(f.id)} className="btn-game btn-ghost w-8 h-8 !rounded-lg flex items-center justify-center shrink-0" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
