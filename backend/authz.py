

from fastapi import HTTPException

from backend import database, workspaces


def require_workspace_member(workspace_id: str, user_id: str) -> dict:
    """Any member (owner or member) may view/analyze. 404, not 403 --
    same reasoning as the existing group lookups: don't confirm to a
    caller whether a workspace_id they don't belong to even exists."""
    membership = workspaces.get_membership(workspace_id, user_id)
    if membership is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return membership


def require_workspace_owner(workspace_id: str, user_id: str) -> dict:
    """Administrative actions: invites, member management, workspace
    settings, deletion. Role-based, not flag-based -- there is no
    combination of can_upload/can_modify_datasets that satisfies this."""
    membership = require_workspace_member(workspace_id, user_id)
    if membership["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only the workspace owner can do this")
    return membership


def require_upload_permission(workspace_id: str, user_id: str) -> dict:
    """Uploading new files / creating new datasets. Owners always pass
    (role-guaranteed); members need can_upload=true."""
    membership = require_workspace_member(workspace_id, user_id)
    if membership["role"] != "owner" and not membership["can_upload"]:
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to upload files or create datasets in this workspace",
        )
    return membership


def require_modify_permission(workspace_id: str, user_id: str) -> dict:
    """Altering EXISTING workspace data: append to / rename / delete a
    dataset, delete files from it. Owners always pass; members need
    can_modify_datasets=true."""
    membership = require_workspace_member(workspace_id, user_id)
    if membership["role"] != "owner" and not membership["can_modify_datasets"]:
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to modify existing datasets in this workspace",
        )
    return membership


def require_upload_or_modify_permission(workspace_id: str, user_id: str) -> dict:
    """Landing files into a temp upload session doesn't yet decide
    whether they'll become a brand new dataset (needs can_upload) or get
    appended to an existing one (needs can_modify_datasets) -- that's
    only decided at save-time, per group. So the upload step itself just
    needs EITHER permission; /groups/save re-checks the specific one
    that actually applies to each group."""
    membership = require_workspace_member(workspace_id, user_id)
    if membership["role"] != "owner" and not membership["can_upload"] and not membership["can_modify_datasets"]:
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to upload files in this workspace",
        )
    return membership


def get_group_for_member(group_id: str, user_id: str) -> tuple[dict, dict]:
    """Fetches a group and verifies the current user is a member of the
    WORKSPACE THAT GROUP ACTUALLY BELONGS TO -- derived from the group
    row itself, never from a workspace_id the frontend sent alongside
    it. Returns (group, membership). 404 if the group doesn't exist OR
    the caller isn't a member of its workspace -- both look identical
    from the outside, which is the point."""
    group = database.get_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    try:
        membership = require_workspace_member(group["workspace_id"], user_id)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Group not found")
    return group, membership


def get_group_for_upload(group_id: str, user_id: str) -> tuple[dict, dict]:
    """Like get_group_for_member, but for adding new files to an
    EXISTING group -- which is a modify operation (it changes what an
    already-saved dataset contains), not a create operation."""
    group, _ = get_group_for_member(group_id, user_id)
    membership = require_modify_permission(group["workspace_id"], user_id)
    return group, membership


def get_group_for_modify(group_id: str, user_id: str) -> tuple[dict, dict]:
    """Renaming / deleting a group or a file within it."""
    group, _ = get_group_for_member(group_id, user_id)
    membership = require_modify_permission(group["workspace_id"], user_id)
    return group, membership


def get_upload_session_for_user(session_id: str, user_id: str, workspace_id: str) -> dict:
    """Verifies a temp upload session belongs to THIS user AND was
    created for THIS workspace, before any operation reads from it,
    writes to it, or finalizes it. This is what stops a member of
    Workspace A from manipulating or finalizing a session that actually
    belongs to Workspace B (or another user entirely) -- the session_id
    being unguessable is not treated as sufficient authorization on its
    own."""
    session = workspaces.get_upload_session(session_id)
    if session is None or session["user_id"] != user_id or session["workspace_id"] != workspace_id:
        raise HTTPException(status_code=404, detail="Upload session not found")
    return session
