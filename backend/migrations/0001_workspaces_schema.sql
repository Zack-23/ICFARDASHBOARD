-- Migration 0001: Workspace system schema.
--
-- Adds the workspace/membership/invite layer on top of the existing
-- `groups` / `group_readings` tables. Additive only -- nothing here
-- drops or rewrites existing data. Run this in the Supabase SQL editor
-- (or `psql`) against your project.
--
-- After this file, run 0002_workspaces_backfill.sql to migrate existing
-- groups into a personal workspace per user, then 0003_workspaces_enforce.sql
-- to lock workspace_id down to NOT NULL once you've confirmed the
-- backfill looks correct.
--
-- Column/PK naming follows the existing convention in this project
-- (groups.group_id, not groups.id) -- workspaces.workspace_id,
-- workspace_invites.invite_id, etc.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- workspaces -- the primary ownership boundary for research data.
-- ---------------------------------------------------------------------
create table if not exists workspaces (
    workspace_id uuid primary key default gen_random_uuid(),
    name text not null,
    description text,
    created_by uuid not null,          -- attribution only, not an access check
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- workspace_members -- who belongs to a workspace, and what they can do.
-- role='owner' is authoritative for owner-only actions; can_upload /
-- can_modify_datasets only matter for role='member'. Unique on
-- (workspace_id, user_id) prevents duplicate membership; the partial
-- unique index below guarantees at most one owner per workspace so a
-- manipulated request can never create a second one.
-- ---------------------------------------------------------------------
create table if not exists workspace_members (
    workspace_id uuid not null references workspaces(workspace_id) on delete cascade,
    user_id uuid not null,
    role text not null default 'member' check (role in ('owner', 'member')),
    can_upload boolean not null default false,
    can_modify_datasets boolean not null default false,
    joined_at timestamptz not null default now(),
    primary key (workspace_id, user_id)
);

create index if not exists idx_workspace_members_user
    on workspace_members(user_id);

create unique index if not exists uq_workspace_single_owner
    on workspace_members(workspace_id)
    where role = 'owner';

-- ---------------------------------------------------------------------
-- workspace_invites -- reusable, revocable, expiring invite links.
-- Stores a HASH of the token, never the plaintext token itself (the
-- plaintext only ever exists in the URL handed to the invitee). The
-- permissions on the invite become the new member's initial
-- permissions at accept-time -- after that, they belong to the
-- membership row, independent of the invite.
-- ---------------------------------------------------------------------
create table if not exists workspace_invites (
    invite_id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references workspaces(workspace_id) on delete cascade,
    token_hash text not null unique,
    can_upload boolean not null default false,
    can_modify_datasets boolean not null default false,
    created_by uuid not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    revoked_at timestamptz
);

create index if not exists idx_workspace_invites_workspace
    on workspace_invites(workspace_id);

-- ---------------------------------------------------------------------
-- upload_sessions -- server-side ownership record for a temp upload
-- session. Previously a session_id was just an unguessable UUID with
-- NO tracked owner -- anyone who learned it could add files to it or
-- finalize it into any workspace. Every session now has to be created
-- for a specific (user, workspace) pair, and every later operation
-- against that session_id is checked against this row.
-- ---------------------------------------------------------------------
create table if not exists upload_sessions (
    session_id uuid primary key,
    user_id uuid not null,
    workspace_id uuid not null references workspaces(workspace_id) on delete cascade,
    created_at timestamptz not null default now()
);

create index if not exists idx_upload_sessions_workspace
    on upload_sessions(workspace_id);

-- ---------------------------------------------------------------------
-- user_preferences -- server-side "last active workspace", so this
-- survives clearing localStorage / switching devices. One row per user.
-- ---------------------------------------------------------------------
create table if not exists user_preferences (
    user_id uuid primary key,
    active_workspace_id uuid references workspaces(workspace_id) on delete set null,
    updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- groups -- attach the existing table to its owning workspace. Left
-- NULLable for now on purpose: 0002 backfills every existing row before
-- 0003 makes this NOT NULL. groups.user_id is kept as-is and now means
-- "created_by" attribution -- workspace_id is the real access boundary.
-- ---------------------------------------------------------------------
alter table groups add column if not exists workspace_id uuid references workspaces(workspace_id) on delete cascade;

create index if not exists idx_groups_workspace
    on groups(workspace_id);
