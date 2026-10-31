# Cipher Clash

A fast, friendly code-cracking duel game. Hide your 4-digit secret code, race to crack
your rival's first!

## Features

- **4 animated AI rivals** — Pip (Rookie), Sly (Tactician), Professor Hoot (Mastermind),
  Aethelgard (Oracle) — each with its own brain, personality lines, moods and reactions.
- **Online 1v1** — quick match or private rooms with shareable codes, disconnect-safe
  (rejoin your match anytime), private in-match chat + live emoji reactions, rematches.
- **🏁 Race Mode** — both players attack the same shared code at the same time; first
  to crack it wins. Play it vs bots or online.
- **📶 Local WiFi Duel** — two phones on any WiFi/hotspot, zero internet: pair by QR
  code and play directly phone-to-phone (WebRTC).
- **2-player pass-and-play** on one device.
- **Friends** — follow players, see who's online, tap-to-challenge invites ("X wants
  to play — accept?"), friend-online toasts, optional push notifications, and public
  player profiles from the leaderboard.
- **👀 Spectating & replays** — watch friends' live matches and send crowd reactions;
  every match is saved as a step-by-step replay with coach tips.
- **🏆 Code Hunts** — tournaments where everyone races one hidden code for a prize pot;
  host your own private hunt with an invite code.
- **☀️ Daily Code** — one solo puzzle per day (8 tries) with coin rewards.
- **Animated SVG avatars** — 16 characters × 18 colors × 14 accessories + fur patterns,
  frames, board themes and titles in the shop. Avatars are pure SVG so they render
  identically on every phone; emojis are used as decoration & reactions only.
- **12 unique win effects** — coin fountains, bubble pops, laser grids, snowfall,
  emoji bursts, a crowning ceremony and more — no two look alike.
- **Progression** — trophies & divisions (Bronze → Legend), monthly ranked seasons
  with end-of-season rewards, levels, daily quests, daily challenges, achievements,
  and a real day-streak system.
- **Community** — lobby chat, star reviews (shown publicly after admin approval),
  and a feedback inbox.
- **Playable tutorial** with Professor Hoot, light & dark modes, installable PWA.

## Tech

Next.js (App Router) · React · Tailwind CSS · Drizzle ORM · PostgreSQL (Supabase) ·
WebRTC for local play · Web Push (VAPID) for notifications

## Setup

See `DEPLOY_INSTRUCTIONS.md`. In short: set env vars and deploy to Vercel — the app
creates/updates its own database schema on boot (SQL snapshots live in
`supabase/migrations/`). Push notifications are optional: add `VAPID_*` keys to enable.

## Local dev

```bash
npm install
npm run dev
```
