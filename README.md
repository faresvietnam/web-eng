# Anki Vocab App

Local-first English vocabulary spaced-repetition app, deployed on Vercel with Supabase as the database.

## Setup

1. Create a Supabase project, run `supabase/migrations/0001_init.sql` in the SQL editor.
2. Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Supabase project settings.
3. `npm install`
4. `npm run dev` (frontend only, via Vite) — for the full stack including `/api` functions, run `vercel dev` directly instead (not through an npm script; Vercel CLI refuses to run if `package.json`'s `dev` script itself invokes `vercel dev`)
5. `npm test` (runs Vitest unit tests for `lib/*.js`)

## Deploy

1. `vercel link` (first time only, links this directory to a Vercel project)
2. In the Vercel project dashboard, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as environment variables (Production + Preview).
3. `vercel deploy --prod`
#deploy
