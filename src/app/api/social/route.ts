import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, follows, matches, matchInvites, chatMessages } from "@/db/schema";
import { ensureDatabaseReady } from "@/db/seed";
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { normalizeAvatar, DEFAULT_AVATAR } from "@/lib/avatar";
import { randomToken, verifyToken } from "@/lib/auth-server";
import { sendPushToPlayer } from "@/lib/push-server";

type PlayerRow = typeof players.$inferSelect;
type InviteRow = typeof matchInvites.$inferSelect;

const ONLINE_WINDOW_MS = 100_000;
const INVITE_TTL_MS = 75_000;

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeRoomCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

function isOnline(p: PlayerRow): boolean {
  return p.isOnline && Date.now() - new Date(p.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

/** Map playerId -> roomCode for players currently in a live, fresh match. */
async function liveMatchMap(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (ids.length === 0) return map;
  const rows = await db
    .select()
    .from(matches)
    .where(
      and(
        inArray(matches.status, ["playing", "setup"]),
        or(inArray(matches.player1Id, ids), inArray(matches.player2Id, ids))
      )
    )
    .orderBy(desc(matches.createdAt))
    .limit(60);
  const now = Date.now();
  for (const m of rows) {
    const fresh1 = m.p1SeenAt && now - new Date(m.p1SeenAt).getTime() < 90_000;
    const fresh2 = m.p2SeenAt && now - new Date(m.p2SeenAt).getTime() < 90_000;
    if (m.player1Id && fresh1 && !map.has(m.player1Id)) map.set(m.player1Id, m.roomCode);
    if (m.player2Id && fresh2 && !map.has(m.player2Id)) map.set(m.player2Id, m.roomCode);
  }
  return map;
}

function socialPlayer(p: PlayerRow, live: Map<number, string>, followingSet?: Set<number>) {
  return {
    id: p.id,
    username: p.username,
    avatarConfig: normalizeAvatar(p.avatarConfig || DEFAULT_AVATAR),
    frameId: p.frameId,
    title: p.title,
    division: p.division,
    trophies: p.trophies,
    level: p.level,
    isOnline: isOnline(p),
    inMatchRoom: live.get(p.id) || null,
    following: followingSet ? followingSet.has(p.id) : undefined,
  };
}

function inviteView(inv: InviteRow, viewerId: number) {
  const isFrom = inv.fromPlayerId === viewerId;
  return {
    id: inv.id,
    fromPlayerId: inv.fromPlayerId,
    toPlayerId: inv.toPlayerId,
    fromName: inv.fromName,
    fromAvatar: normalizeAvatar(inv.fromAvatarConfig || DEFAULT_AVATAR),
    fromFrame: inv.fromFrame || "frame_emerald",
    timerSeconds: inv.timerSeconds,
    kind: (inv.kind === "rematch" ? "rematch" : "challenge") as "challenge" | "rematch",
    status: inv.status,
    roomCode: inv.roomCode,
    myToken: inv.status === "accepted" ? (isFrom ? inv.p1Token || undefined : inv.p2Token || undefined) : undefined,
    mySlot: inv.status === "accepted" ? ((isFrom ? 1 : 2) as 1 | 2) : undefined,
    createdAt: new Date(inv.createdAt).toISOString(),
    expiresAt: new Date(inv.expiresAt).toISOString(),
  };
}

async function expireStaleInvites() {
  await db
    .update(matchInvites)
    .set({ status: "expired" })
    .where(and(eq(matchInvites.status, "pending"), lt(matchInvites.expiresAt, new Date())))
    .catch(() => {});
}

async function getPlayer(id: number): Promise<PlayerRow | null> {
  const [row] = await db.select().from(players).where(eq(players.id, id)).limit(1);
  return row || null;
}

/** Create the actual 1v1 room for an accepted invite (challenger = Player 1). */
async function createInviteRoom(inv: InviteRow, host: PlayerRow, guest: PlayerRow) {
  const p1Token = randomToken(20);
  const p2Token = randomToken(20);
  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = makeRoomCode();
    try {
      const [created] = await db
        .insert(matches)
        .values({
          roomCode,
          mode: "online_1v1",
          status: "setup",
          timerSeconds: inv.timerSeconds,
          isPrivate: true,
          version: 1,
          player1Id: host.id,
          player1Name: host.username,
          player1AvatarConfig: normalizeAvatar(host.avatarConfig),
          player1Frame: host.frameId,
          player1Division: host.division,
          p1Token,
          p1SeenAt: new Date(),
          player2Id: guest.id,
          player2Name: guest.username,
          player2AvatarConfig: normalizeAvatar(guest.avatarConfig),
          player2Frame: guest.frameId,
          player2Division: guest.division,
          p2Token,
          p2SeenAt: new Date(),
          currentTurn: 1,
          guesses: [],
          turnStartedAt: new Date(),
        })
        .returning();
      const [updated] = await db
        .update(matchInvites)
        .set({ status: "accepted", roomCode: created.roomCode, p1Token, p2Token })
        .where(eq(matchInvites.id, inv.id))
        .returning();
      return { invite: updated, roomCode: created.roomCode, p1Token, p2Token };
    } catch {
      /* room code collision — retry */
    }
  }
  return null;
}

/* ---------------------------------- GET ---------------------------------- */

export async function GET(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    await expireStaleInvites();
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token") || req.headers.get("authorization")?.replace("Bearer ", "");
    const meId = verifyToken(token);
    const lobbyAfter = Number(searchParams.get("lobbyAfter") || 0);

    // lobby unread (works for guests too)
    let lobbyUnread = 0;
    if (lobbyAfter > 0) {
      const [{ c }] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(chatMessages)
        .where(and(isNull(chatMessages.receiverId), gt(chatMessages.id, lobbyAfter)));
      lobbyUnread = Math.min(99, Number(c) || 0);
    }

    // players online right now (top by trophies)
    const onlineCutoff = new Date(Date.now() - ONLINE_WINDOW_MS);
    const onlineRows = await db
      .select()
      .from(players)
      .where(and(eq(players.isOnline, true), gt(players.lastSeenAt, onlineCutoff)))
      .orderBy(desc(players.trophies))
      .limit(40);

    if (!meId) {
      const live = await liveMatchMap(onlineRows.map((p) => p.id));
      return NextResponse.json({
        onlineNow: onlineRows.map((p) => socialPlayer(p, live)),
        lobbyUnread,
      });
    }

    const followingRows = await db.select().from(follows).where(eq(follows.followerId, meId));
    const followerRows = await db.select().from(follows).where(eq(follows.followingId, meId));
    const followingIds = [...new Set(followingRows.map((f) => f.followingId))];
    const followerIds = [...new Set(followerRows.map((f) => f.followerId))];
    const followingSet = new Set(followingIds);

    const allIds = [...new Set([...followingIds, ...followerIds, ...onlineRows.map((p) => p.id)])].filter((id) => id !== meId);
    const byId = new Map<number, PlayerRow>();
    if (allIds.length) {
      const rows = await db.select().from(players).where(inArray(players.id, allIds));
      for (const r of rows) byId.set(r.id, r);
    }
    const live = await liveMatchMap(allIds);

    const invitesIn = await db
      .select()
      .from(matchInvites)
      .where(and(eq(matchInvites.toPlayerId, meId), eq(matchInvites.status, "pending")))
      .orderBy(desc(matchInvites.createdAt))
      .limit(5);

    const recentCutoff = new Date(Date.now() - 3 * 60 * 1000);
    const invitesOut = await db
      .select()
      .from(matchInvites)
      .where(
        and(
          eq(matchInvites.fromPlayerId, meId),
          or(
            eq(matchInvites.status, "pending"),
            and(eq(matchInvites.status, "accepted"), gt(matchInvites.createdAt, recentCutoff))
          )
        )
      )
      .orderBy(desc(matchInvites.createdAt))
      .limit(5);

    return NextResponse.json({
      following: followingIds.map((id) => byId.get(id)).filter(Boolean).map((p) => socialPlayer(p as PlayerRow, live, followingSet)),
      followers: followerIds.map((id) => byId.get(id)).filter(Boolean).map((p) => socialPlayer(p as PlayerRow, live, followingSet)),
      onlineNow: onlineRows.filter((p) => p.id !== meId).map((p) => socialPlayer(p, live, followingSet)),
      invitesIn: invitesIn.map((i) => inviteView(i, meId)),
      invitesOut: invitesOut.map((i) => inviteView(i, meId)),
      lobbyUnread,
    });
  } catch (error) {
    console.error("GET /api/social error:", error);
    return NextResponse.json({ error: "Failed to load social data" }, { status: 500 });
  }
}

/* ---------------------------------- POST --------------------------------- */

export async function POST(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await req.json().catch(() => ({}));
    const meId = verifyToken(body.token || req.headers.get("authorization")?.replace("Bearer ", ""));
    if (!meId) {
      return NextResponse.json({ error: "Create a free account to use friends & challenges!", code: "auth" }, { status: 401 });
    }
    const me = await getPlayer(meId);
    if (!me) return NextResponse.json({ error: "Player not found" }, { status: 404 });
    const action = String(body.action || "");
    await expireStaleInvites();

    /* ------------------------------ follow ------------------------------ */
    if (action === "follow" || action === "unfollow") {
      const targetId = Number(body.targetId || 0);
      if (!targetId || targetId === meId) return NextResponse.json({ error: "Invalid player" }, { status: 400 });
      const target = await getPlayer(targetId);
      if (!target) return NextResponse.json({ error: "Player not found" }, { status: 404 });

      if (action === "unfollow") {
        await db.delete(follows).where(and(eq(follows.followerId, meId), eq(follows.followingId, targetId)));
        return NextResponse.json({ ok: true, following: false });
      }
      const existing = await db
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, meId), eq(follows.followingId, targetId)))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(follows).values({ followerId: meId, followingId: targetId });
      }
      return NextResponse.json({ ok: true, following: true });
    }

    /* ----------------------------- challenge ----------------------------- */
    if (action === "challenge") {
      const targetId = Number(body.targetId || 0);
      if (!targetId || targetId === meId) return NextResponse.json({ error: "You can't challenge yourself!" }, { status: 400 });
      const target = await getPlayer(targetId);
      if (!target) return NextResponse.json({ error: "Player not found" }, { status: 404 });
      const timerSeconds = [15, 30, 45, 60, 90].includes(Number(body.timerSeconds)) ? Number(body.timerSeconds) : 45;
      const kind = body.kind === "rematch" ? "rematch" : "challenge";

      // If they already challenged ME, treat this as accepting their invite.
      const [reverse] = await db
        .select()
        .from(matchInvites)
        .where(
          and(
            eq(matchInvites.fromPlayerId, targetId),
            eq(matchInvites.toPlayerId, meId),
            eq(matchInvites.status, "pending"),
            gt(matchInvites.expiresAt, new Date())
          )
        )
        .limit(1);
      if (reverse) {
        const made = await createInviteRoom(reverse, target, me);
        if (!made) return NextResponse.json({ error: "Could not create the match room." }, { status: 500 });
        sendPushToPlayer(targetId, { title: "⚔️ Your duel is ON!", body: `${me.username} accepted — tap to play!`, url: "/" }).catch(() => {});
        return NextResponse.json({ invite: inviteView(made.invite, meId), roomCode: made.roomCode, slot: 2, token: made.p2Token, accepted: true });
      }

      // Reuse my existing pending invite to them.
      const [existing] = await db
        .select()
        .from(matchInvites)
        .where(
          and(
            eq(matchInvites.fromPlayerId, meId),
            eq(matchInvites.toPlayerId, targetId),
            eq(matchInvites.status, "pending"),
            gt(matchInvites.expiresAt, new Date())
          )
        )
        .limit(1);
      if (existing) return NextResponse.json({ invite: inviteView(existing, meId) });

      const [created] = await db
        .insert(matchInvites)
        .values({
          fromPlayerId: meId,
          toPlayerId: targetId,
          fromName: me.username,
          fromAvatarConfig: normalizeAvatar(me.avatarConfig),
          fromFrame: me.frameId,
          timerSeconds,
          kind,
          status: "pending",
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        })
        .returning();

      sendPushToPlayer(targetId, {
        title: kind === "rematch" ? "↩️ Rematch?" : "⚔️ You've been challenged!",
        body: `${me.username} wants to duel you in Cipher Clash. Accept within 75s!`,
        url: "/",
        tag: `invite-${created.id}`,
      }).catch(() => {});

      return NextResponse.json({ invite: inviteView(created, meId) });
    }

    /* --------------------------- respond invite --------------------------- */
    if (action === "respond_invite") {
      const inviteId = Number(body.inviteId || 0);
      const [inv] = await db.select().from(matchInvites).where(eq(matchInvites.id, inviteId)).limit(1);
      if (!inv || inv.toPlayerId !== meId) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
      if (inv.status === "accepted" && inv.roomCode && inv.p2Token) {
        return NextResponse.json({ invite: inviteView(inv, meId), roomCode: inv.roomCode, slot: 2, token: inv.p2Token, accepted: true });
      }
      if (inv.status !== "pending" || new Date(inv.expiresAt).getTime() < Date.now()) {
        if (inv.status === "pending") await db.update(matchInvites).set({ status: "expired" }).where(eq(matchInvites.id, inv.id));
        return NextResponse.json({ error: "That challenge expired." }, { status: 410 });
      }
      if (!Boolean(body.accept)) {
        const [updated] = await db.update(matchInvites).set({ status: "declined" }).where(eq(matchInvites.id, inv.id)).returning();
        return NextResponse.json({ invite: inviteView(updated, meId), declined: true });
      }
      const host = await getPlayer(inv.fromPlayerId);
      if (!host) return NextResponse.json({ error: "Challenger not found." }, { status: 404 });
      const made = await createInviteRoom(inv, host, me);
      if (!made) return NextResponse.json({ error: "Could not create the match room." }, { status: 500 });
      sendPushToPlayer(inv.fromPlayerId, { title: "⚔️ Your duel is ON!", body: `${me.username} accepted your challenge — tap to play!`, url: "/" }).catch(() => {});
      return NextResponse.json({ invite: inviteView(made.invite, meId), roomCode: made.roomCode, slot: 2, token: made.p2Token, accepted: true });
    }

    /* ---------------------------- cancel invite ---------------------------- */
    if (action === "cancel_invite") {
      const inviteId = Number(body.inviteId || 0);
      await db
        .update(matchInvites)
        .set({ status: "cancelled" })
        .where(and(eq(matchInvites.id, inviteId), eq(matchInvites.fromPlayerId, meId), eq(matchInvites.status, "pending")));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/social error:", error);
    return NextResponse.json({ error: "Failed to process social action" }, { status: 500 });
  }
}
