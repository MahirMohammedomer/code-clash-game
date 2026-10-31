# Deployment and database safety

Set `DATABASE_URL` (or `SUPABASE_DB_URL`) and the public Supabase URL and anon key in your hosting provider's environment settings. Never commit credentials. Apply new migrations in order after taking a backup; do not run `0000_reset.sql` on an existing database.

**Security incident:** Previous revisions of this repository contained database credentials. Rotate the database password and any exposed secrets, update all environments, and review access logs. Removing them from this file does not remove them from Git history.

The current legacy account and multiplayer APIs do not yet provide authenticated, authorized sessions. Do not rely on them for private conversations or deploy this branch to production until authentication and authorization are implemented and independently tested.
