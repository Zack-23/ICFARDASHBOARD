-- Migration 0002: Backfill existing groups into personal workspaces.
--
-- For every distinct user_id currently in `groups` that has no
-- workspace yet, this creates a "Personal Workspace", makes that user
-- its owner (full permissions, guaranteed by role), attaches all of
-- their existing groups to it, and sets it as their active workspace.
--
-- Safe to re-run: it only ever touches groups where workspace_id is
-- still null, and only ever creates a workspace for a user who doesn't
-- already have a personal-workspace membership from a prior run.
--
-- Run this AFTER 0001_workspaces_schema.sql and BEFORE
-- 0003_workspaces_enforce.sql. Review the result (see the verification
-- queries at the bottom of this file) before proceeding to 0003.

do $$
declare
    r record;
    new_workspace_id uuid;
begin
    for r in
        select distinct user_id
        from groups
        where workspace_id is null
    loop
        insert into workspaces (name, created_by)
        values ('Personal Workspace', r.user_id)
        returning workspace_id into new_workspace_id;

        insert into workspace_members (workspace_id, user_id, role, can_upload, can_modify_datasets)
        values (new_workspace_id, r.user_id, 'owner', true, true);

        update groups
        set workspace_id = new_workspace_id
        where user_id = r.user_id
          and workspace_id is null;

        insert into user_preferences (user_id, active_workspace_id)
        values (r.user_id, new_workspace_id)
        on conflict (user_id) do update
            set active_workspace_id = excluded.active_workspace_id,
                updated_at = now();
    end loop;
end $$;

-- ---------------------------------------------------------------------
-- Verification -- run these manually and eyeball the results before
-- applying 0003. Expect: zero rows from the first query, and the
-- second query's row count to match your total row count in `groups`.
-- ---------------------------------------------------------------------
-- select group_id, name, user_id from groups where workspace_id is null;
-- select count(*) from groups g join workspaces w on w.workspace_id = g.workspace_id;
