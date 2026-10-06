# Code Clash – Deploy Instructions (Updated)

## CRITICAL: Environment Variables MUST be set in Vercel BEFORE deploying

Go to your Vercel project → **Settings → Environment Variables** and add ALL of these:

```
NEXT_PUBLIC_SUPABASE_URL=https://xeqogvffitidtjjhlpsq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlcW9ndmZmaXRpZHRqamhscHNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzODcxOTYsImV4cCI6MjEwNTk2MzE5Nn0.ilOATHMo7NohYBBywKP8McXATGGN2jp8SkCmsCiE_4A

SUPABASE_URL=https://xeqogvffitidtjjhlpsq.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlcW9ndmZmaXRpZHRqamhscHNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzODcxOTYsImV4cCI6MjEwNTk2MzE5Nn0.ilOATHMo7NohYBBywKP8McXATGGN2jp8SkCmsCiE_4A

POSTGRES_URL=postgresql://postgres:P39WDsdkwzywtHyW@db.xeqogvffitidtjjhlpsq.supabase.co:5432/postgres
SUPABASE_DB_URL=postgresql://postgres:P39WDsdkwzywtHyW@db.xeqogvffitidtjjhlpsq.supabase.co:5432/postgres
POSTGRES_URL_NON_POOLING=postgresql://postgres:P39WDsdkwzywtHyW@db.xeqogvffitidtjjhlpsq.supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:P39WDsdkwzywtHyW@db.xeqogvffitidtjjhlpsq.supabase.co:5432/postgres

GUEST_SECRET=codeclash_guest_secret_8f3k9d2m7x1p0q5r8t4v6w9y2z7a3b5c
```

**Important:** Select **Production**, **Preview** and **Development** for each variable.

After adding the variables, click **Save**.

---

## 1. Clean the Database (do this once)

1. Open Supabase → SQL Editor
2. Run:

```sql
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS tournaments CASCADE;
DROP TABLE IF EXISTS follows CASCADE;
DROP TABLE IF EXISTS clubs CASCADE;
DROP TABLE IF EXISTS players CASCADE;
```

3. Then paste and run the full content of `supabase/migrations/0001_code_clash_schema.sql`

---

## 2. Deploy

1. Download the new zip I prepared
2. Upload it to Vercel
3. Make sure the environment variables are already saved before the build starts

The code has been fixed so it no longer crashes during the build if the variables are missing (it will only fail at runtime if they are still missing).
