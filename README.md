# Cipher Clash

A fast, friendly code-cracking duel game. Hide your 4-digit secret code, race to crack
your rival's first!

## Features

- **4 animated AI rivals** — Pip (Rookie), Sly (Tactician), Professor Hoot (Mastermind),
  Aethelgard (Oracle) — each with its own brain, personality lines, moods and reactions.
- **Online 1v1** — quick match or private rooms with shareable codes, disconnect-safe
  (rejoin your match anytime), private in-match chat + live reactions.
- **2-player pass-and-play** on one device.
- **Animated SVG avatars** — 8 characters × 12 colors × 10 accessories, plus frames,
  board themes, win effects and titles in the shop. No emoji anywhere, so avatars look
  the same on every phone.
- **Progression** — trophies & divisions (Bronze → Legend), levels, daily quests,
  daily challenge modes, achievements, and a real day-streak system.
- **Community** — lobby chat, star reviews (shown publicly after admin approval),
  and a feedback inbox.
- **Playable tutorial** with Professor Hoot, light & dark modes, installable PWA.

## Tech

Next.js (App Router) · React · Tailwind CSS · Drizzle ORM · PostgreSQL (Supabase)

## Setup

See `DEPLOY_INSTRUCTIONS.md`. In short: set env vars, run
`supabase/migrations/0003_cipher_clash_rebuild.sql`, deploy to Vercel.

## Local dev

```bash
npm install
npm run dev
```
