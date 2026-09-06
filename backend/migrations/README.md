# Workspace migrations

Run these in order, in the Supabase SQL editor (Project → SQL Editor → New query), against your project's database. None of them are destructive to existing data.

1. **`0001_workspaces_schema.sql`** — creates `workspaces`, `workspace_members`, `workspace_invites`, `upload_sessions`, `user_preferences`, and adds a nullable `workspace_id` column to `groups`. Safe to run anytime; nothing existing changes behavior yet.
2. **`0002_workspaces_backfill.sql`** — for every user who already has groups, creates a "Personal Workspace", makes them its owner, and attaches their existing groups to it. Idempotent — safe to re-run. Run the two verification `select`s at the bottom of the file afterward and confirm the first returns zero rows.
3. **`0003_workspaces_enforce.sql`** — makes `groups.workspace_id` `NOT NULL`. Only run this once step 2's verification looks correct. The backend code deployed alongside these migrations already requires `workspace_id` on every group read/write, so this is a formality that catches anything the backfill missed.

No existing table is dropped or renamed. `groups.user_id` is untouched — it keeps meaning "created by", not "owned by"; workspace membership is now the access boundary.
