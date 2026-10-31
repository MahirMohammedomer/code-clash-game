# Cipher Clash — Deploy Guide (v4)

> ⚠️ **SECURITY FIRST:** Previous versions of this repo accidentally committed a real
> database password and API keys to GitHub. **Rotate your Supabase database password now**
> (Supabase → Project Settings → Database → Reset database password), then update the
> environment variables in Vercel with the new value. Never paste real secrets into files
> that get committed — keep them only in Vercel/Supabase dashboards.

## 1. Environment variables (Vercel → Settings → Environment Variables)

Set these for Production, Preview, and Development. Copy the **values** from your
Supabase project (Project Settings → API / Database). Do NOT write them into this repo.

```
NEXT_PUBLIC_SUPABASE_URL=     (Supabase → Settings → API → Project URL)
NEXT_PUBLIC_SUPABASE_ANON_KEY=(Supabase → Settings → API → anon public key)
SUPABASE_DB_URL=              (Supabase → Settings → Database → Connection string, URI)
SESSION_SECRET=               (any long random string you invent — keep it secret)
ADMIN_USERNAMES=              (your in-game username, e.g. Mahir — makes you review admin)
```

`SUPABASE_DB_URL` is the only strictly required one for the game server.
The app also understands `POSTGRES_URL` / `DATABASE_URL` if you already have those set.

### Optional: push notifications (new in v4)

Push lets you notify players when a friend challenges them, a hunt ends, etc.
It's completely optional — without keys the game works exactly the same, just
without push. To enable:

1. Run `npx web-push generate-vapid-keys` on any computer (prints two keys).
2. Add to Vercel env vars:
   - `VAPID_PUBLIC_KEY` — the public key it printed
   - `VAPID_PRIVATE_KEY` — the private key it printed (treat like a password!)
   - `VAPID_SUBJECT` — `mailto:youremail@example.com`
3. Redeploy. Players then get a "Notifications" toggle in Settings.

## 2. Database upgrade (one time)

The app auto-migrates on first run, so you normally don't have to do anything.
To apply manually, run in Supabase → SQL Editor `supabase/migrations/0003_cipher_clash_rebuild.sql`
(for v3→) and then `supabase/migrations/0004_social_update.sql` (v4: follows, invites,
match history, tournaments, push subs, seasons). All migrations only ADD
columns/tables — existing players keep everything.

## 3. Deploy

Push to GitHub → Vercel auto-deploys. Or connect the repo in Vercel and press Deploy.

## 4. Make yourself admin (approve reviews, read feedback)

Either set `ADMIN_USERNAMES=YourGameUsername` in Vercel (step 1) — you'll become admin
automatically at next login — or run this in Supabase SQL Editor:

```sql
UPDATE public.players SET is_admin = TRUE WHERE username = 'YourGameUsername';
```

Admins see an **Admin** tile on the home screen with pending reviews + feedback inbox.

## Notes

- Passwords are now hashed (scrypt). Old plaintext passwords upgrade automatically on login.
- Existing players keep coins/gems/trophies/achievements; everyone gets the new animated
  avatar system (the old emoji avatars are replaced — they were why avatars sometimes
  appeared blank on some phones).
