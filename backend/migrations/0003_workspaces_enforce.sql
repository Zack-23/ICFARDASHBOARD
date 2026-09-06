-- Migration 0003: Enforce workspace_id as required.
--
-- Only run this AFTER confirming (via the verification queries at the
-- bottom of 0002_workspaces_backfill.sql) that every existing group has
-- a workspace_id. This is the one statement in this migration set that
-- turns a soft invariant into a hard one -- deliberately kept in its
-- own file so it's a conscious, separate step.

alter table groups alter column workspace_id set not null;
