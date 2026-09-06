

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend import auth, validator, processor, storage, database, analytics, workspaces, authz

app = FastAPI()

# The frontend (Vite, default port 5173) runs on a different port than
# this backend, so CORS has to explicitly allow it. Add your real
# deployed domain here later too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://red-bay-0c369c20f.7.azurestaticapps.net",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    """Unprotected -- just confirms the server is up."""
    return {"status": "ok"}


@app.get("/me")
def get_me(user_id: str = Depends(auth.get_current_user_id)):
    """Protected -- proves a verified Supabase session reached the backend."""
    return {"user_id": user_id}


# ---------------------------------------------------------------------
# Workspaces -- create, list, switch, rename, delete. Every workspace
# object returned to the frontend has the current user's own role and
# permissions folded in, so the UI can decide what to show without a
# second lookup.
# ---------------------------------------------------------------------

def _serialize_workspace(ws: dict) -> dict:
    return {
        "workspace_id": ws["workspace_id"],
        "name": ws["name"],
        "description": ws.get("description"),
        "created_by": ws["created_by"],
        "created_at": ws["created_at"],
        "updated_at": ws["updated_at"],
        "role": ws["role"],
        "can_upload": ws["can_upload"],
        "can_modify_datasets": ws["can_modify_datasets"],
    }


def _workspace_with_membership(workspace_id: str, membership: dict) -> dict:
    ws = workspaces.get_workspace(workspace_id)
    return _serialize_workspace({**ws, **membership})


class CreateWorkspaceRequest(BaseModel):
    name: str
    description: str | None = None


@app.get("/workspaces")
def list_workspaces(user_id: str = Depends(auth.get_current_user_id)):
    """Every workspace the current user belongs to -- powers the
    workspace switcher and the "which workspace do I have" check that
    decides between onboarding and the dashboard."""
    rows = workspaces.list_user_workspaces(user_id)
    return {"workspaces": [_serialize_workspace(r) for r in rows]}


@app.get("/workspaces/active")
def get_active_workspace(user_id: str = Depends(auth.get_current_user_id)):
    """Resolves the workspace Home should open on sign-in: the user's
    saved preference, if it still exists and they still belong to it;
    otherwise falls back to any workspace they belong to (and saves that
    as the new preference, so it stays stable on the next load); if they
    belong to none, returns null so the frontend shows onboarding
    instead of an empty dashboard."""
    all_workspaces = workspaces.list_user_workspaces(user_id)
    by_id = {w["workspace_id"]: w for w in all_workspaces}

    preferred_id = workspaces.get_active_workspace_id(user_id)
    if preferred_id and preferred_id in by_id:
        return {"workspace": _serialize_workspace(by_id[preferred_id])}

    if all_workspaces:
        fallback = all_workspaces[0]
        workspaces.set_active_workspace(user_id, fallback["workspace_id"])
        return {"workspace": _serialize_workspace(fallback)}

    return {"workspace": None}


@app.post("/workspaces")
def create_workspace(
    request: CreateWorkspaceRequest,
    user_id: str = Depends(auth.get_current_user_id),
):
    """Creates a workspace, makes the creator its owner, and immediately
    activates it -- a fresh workspace should never leave the user stuck
    looking at whatever was active before."""
    name = request.name.strip()
    if name == "":
        raise HTTPException(status_code=400, detail="Workspace name cannot be empty")

    ws = workspaces.create_workspace(name, request.description, user_id)
    workspaces.set_active_workspace(user_id, ws["workspace_id"])

    membership = workspaces.get_membership(ws["workspace_id"], user_id)
    return {"workspace": _serialize_workspace({**ws, **membership})}


@app.post("/workspaces/{workspace_id}/activate")
def activate_workspace(
    workspace_id: str,
    user_id: str = Depends(auth.get_current_user_id),
):
    """Switches the user's active workspace. Requires membership --
    switching to a workspace the user doesn't belong to is exactly the
    kind of thing a manipulated request might try."""
    membership = authz.require_workspace_member(workspace_id, user_id)
    workspaces.set_active_workspace(user_id, workspace_id)
    return {"workspace": _workspace_with_membership(workspace_id, membership)}


class UpdateWorkspaceRequest(BaseModel):
    name: str | None = None
    description: str | None = None


@app.patch("/workspaces/{workspace_id}")
def update_workspace(
    workspace_id: str,
    request: UpdateWorkspaceRequest,
    user_id: str = Depends(auth.get_current_user_id),
):
    authz.require_workspace_owner(workspace_id, user_id)

    name = request.name.strip() if request.name is not None else None
    if name == "":
        raise HTTPException(status_code=400, detail="Workspace name cannot be empty")

    ws = workspaces.update_workspace(workspace_id, name, request.description)
    membership = workspaces.get_membership(workspace_id, user_id)
    return {"workspace": _serialize_workspace({**ws, **membership})}


@app.delete("/workspaces/{workspace_id}")
def delete_workspace(
    workspace_id: str,
    user_id: str = Depends(auth.get_current_user_id),
):
    """Deletes a workspace and everything in it. Owner-only, and
    deliberately not soft -- clean up permanent_storage for every group
    first (Storage isn't foreign-keyed, so it won't cascade), then the
    workspace row, which cascades groups/members/invites/upload_sessions
    in the database. Any member's active-workspace preference pointing
    here is cleared automatically (ON DELETE SET NULL)."""
    authz.require_workspace_owner(workspace_id, user_id)

    for group_id in database.list_group_ids(workspace_id):
        storage.delete_permanent_group(group_id)

    workspaces.delete_workspace(workspace_id)
    return {"deleted": workspace_id}


# ---------------------------------------------------------------------
# Members -- owner-only administration. Permission changes take effect
# on the member's very next request, since every request re-checks
# membership fresh -- nothing is cached client-side as a security
# boundary.
# ---------------------------------------------------------------------

@app.get("/workspaces/{workspace_id}/members")
def list_members(
    workspace_id: str,
    user_id: str = Depends(auth.get_current_user_id),
):
    authz.require_workspace_owner(workspace_id, user_id)

    members = workspaces.list_members(workspace_id)
    emails = workspaces.get_user_emails([m["user_id"] for m in members])
    return {
        "members": [
            {**m, "email": emails.get(m["user_id"])}
            for m in members
        ]
    }


class UpdateMemberRequest(BaseModel):
    can_upload: bool
    can_modify_datasets: bool


@app.patch("/workspaces/{workspace_id}/members/{member_user_id}")
def update_member(
    workspace_id: str,
    member_user_id: str,
    request: UpdateMemberRequest,
    user_id: str = Depends(auth.get_current_user_id),
):
    authz.require_workspace_owner(workspace_id, user_id)

    target = workspaces.get_membership(workspace_id, member_user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if target["role"] == "owner":
        raise HTTPException(status_code=400, detail="The workspace owner's permissions can't be changed")

    updated = workspaces.update_member_permissions(
        workspace_id, member_user_id, request.can_upload, request.can_modify_datasets
    )
    return {"member": updated}


@app.delete("/workspaces/{workspace_id}/members/{member_user_id}")
def remove_member(
    workspace_id: str,
    member_user_id: str,
    user_id: str = Depends(auth.get_current_user_id),
):
    authz.require_workspace_owner(workspace_id, user_id)

    target = workspaces.get_membership(workspace_id, member_user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if target["role"] == "owner":
        raise HTTPException(status_code=400, detail="The workspace owner can't be removed")

    workspaces.remove_member(workspace_id, member_user_id)
    return {"removed": member_user_id}


# ---------------------------------------------------------------------
# Invites -- owner-only to create/list/revoke. The public preview and
# accept routes live further down, unauthenticated-friendly.
# ---------------------------------------------------------------------

class CreateInviteRequest(BaseModel):
    can_upload: bool
    can_modify_datasets: bool


@app.post("/workspaces/{workspace_id}/invites")
def create_invite(
    workspace_id: str,
    request: CreateInviteRequest,
    user_id: str = Depends(auth.get_current_user_id),
):
    authz.require_workspace_owner(workspace_id, user_id)

    invite, token = workspaces.create_invite(
        workspace_id, user_id, request.can_upload, request.can_modify_datasets
    )
    # token is the ONLY time the plaintext ever leaves the server -- only
    # its hash is persisted (see workspaces.create_invite).
    return {"invite": invite, "token": token}


@app.get("/workspaces/{workspace_id}/invites")
def list_invites(
    workspace_id: str,
    user_id: str = Depends(auth.get_current_user_id),
):
    """Active invites for this workspace. Note: plaintext tokens are
    never persisted, so this cannot return a usable link -- just enough
    to show "a link is active" plus its permissions/expiry and a Revoke
    action."""
    authz.require_workspace_owner(workspace_id, user_id)
    return {"invites": workspaces.list_invites(workspace_id)}


@app.delete("/workspaces/{workspace_id}/invites/{invite_id}")
def revoke_invite(
    workspace_id: str,
    invite_id: str,
    user_id: str = Depends(auth.get_current_user_id),
):
    authz.require_workspace_owner(workspace_id, user_id)
    workspaces.revoke_invite(workspace_id, invite_id)
    return {"revoked": invite_id}


@app.get("/invites/{token}")
def preview_invite(token: str, user_id: str | None = Depends(auth.get_optional_user_id)):
    """Public-ish: works for a logged-out visitor so they can see what
    they're being invited to before signing in. If they happen to
    already be signed in and already a member, says so instead of
    inviting them to join again."""
    invite = workspaces.get_invite_by_token(token)
    if invite is None:
        return {"status": "not_found"}

    status = workspaces.invite_status(invite)
    if status != "valid":
        return {"status": status}

    ws = workspaces.get_workspace(invite["workspace_id"])
    if ws is None:
        return {"status": "not_found"}

    already_member = False
    if user_id is not None:
        already_member = workspaces.get_membership(invite["workspace_id"], user_id) is not None

    return {
        "status": "already_member" if already_member else "valid",
        "workspace_id": invite["workspace_id"],
        "workspace_name": ws["name"],
        "can_upload": invite["can_upload"],
        "can_modify_datasets": invite["can_modify_datasets"],
    }


@app.post("/invites/{token}/accept")
def accept_invite(token: str, user_id: str = Depends(auth.get_current_user_id)):
    """Requires an explicit, authenticated call -- membership is never
    created just because someone loaded the preview URL."""
    invite = workspaces.get_invite_by_token(token)
    if invite is None:
        raise HTTPException(status_code=404, detail="This invitation is no longer available")

    status = workspaces.invite_status(invite)
    if status == "expired":
        raise HTTPException(status_code=410, detail="This invitation has expired")
    if status == "revoked":
        raise HTTPException(status_code=404, detail="This invitation is no longer available")

    workspace_id = invite["workspace_id"]
    existing = workspaces.get_membership(workspace_id, user_id)
    if existing is not None:
        workspaces.set_active_workspace(user_id, workspace_id)
        return {"status": "already_member", "workspace": _workspace_with_membership(workspace_id, existing)}

    workspaces.add_member(workspace_id, user_id, invite["can_upload"], invite["can_modify_datasets"])
    workspaces.set_active_workspace(user_id, workspace_id)

    membership = workspaces.get_membership(workspace_id, user_id)
    return {"status": "joined", "workspace": _workspace_with_membership(workspace_id, membership)}


# ---------------------------------------------------------------------
# Upload -- step 1: files land in a temp session, grouped by header
# structure. Nothing is saved permanently or combined yet -- that only
# happens once the user actually names a group (see /groups/save). Every
# session is now created for a specific (user, workspace) pair and
# recorded as such, so nothing downstream can act on it for any other
# pair -- see authz.get_upload_session_for_user.
# ---------------------------------------------------------------------

@app.post("/upload")
async def upload_files(
    workspace_id: str = Form(...),
    files: list[UploadFile] = File(...),
    user_id: str = Depends(auth.get_current_user_id),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files were uploaded")

    authz.require_upload_or_modify_permission(workspace_id, user_id)

    session_id = workspaces.create_upload_session(user_id, workspace_id)

    # Group by header structure first -- group_uploaded_files reads each
    # file's content itself, which consumes the upload stream.
    grouping = await validator.group_uploaded_files(files)

    # Re-read each file (seek back to the start) to save its raw bytes
    # into the temp session -- this is what /groups/save later pulls
    # from, for whichever groups the user actually decides to keep.
    for file in files:
        await file.seek(0)
        content = await file.read()
        storage.save_file_to_session(session_id, file.filename, content)

    return {"session_id": session_id, **grouping}


# ---------------------------------------------------------------------
# Save -- step 2: the user has checked which detected groups they want
# and typed a name for each. This is the one place that actually writes
# anything permanent: files move into permanent_storage, processor.py
# combines them, analytics.py converts everything to real numeric
# types, and database.py stores the result -- all attached to the
# workspace the session was created for.
# ---------------------------------------------------------------------

class GroupToSave(BaseModel):
    name: str
    headers: list[str]       # normalized headers, as returned by /upload
    raw_header: list[str]    # original raw tokens, needed by processor.py
    filenames: list[str]     # which files (from this session) belong here


class SaveGroupsRequest(BaseModel):
    workspace_id: str
    session_id: str
    groups: list[GroupToSave]


@app.post("/groups/save")
def save_groups(
    request: SaveGroupsRequest,
    user_id: str = Depends(auth.get_current_user_id),
):
    # Confirms this session actually belongs to this (user, workspace)
    # pair -- a member of Workspace A can't finalize a session that was
    # ever created for Workspace B, even if they somehow learned its id.
    authz.get_upload_session_for_user(request.session_id, user_id, request.workspace_id)

    # Guard against two groups in the SAME request claiming the same name
    # -- without this, the second would silently be treated as an append
    # to the first.
    names_seen = set()
    for group in request.groups:
        if group.name.strip() == "":
            raise HTTPException(status_code=400, detail="Group name cannot be empty")
        if group.name.lower() in names_seen:
            raise HTTPException(
                status_code=400,
                detail=f"'{group.name}' was used for more than one group in this save",
            )
        names_seen.add(group.name.lower())

    results = []
    saved_filenames: list[str] = []

    for group in request.groups:
        existing = database.get_group_by_name(request.workspace_id, group.name)

        if existing is not None:
            # Append case: same name already exists -- this ALTERS an
            # existing dataset, so it needs modify permission, not
            # upload permission.
            authz.require_modify_permission(request.workspace_id, user_id)

            # Refuse silently mismatched structure rather than
            # corrupting the group's data.
            if existing["headers"] != group.headers:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"A group named '{group.name}' already exists with a "
                        "different column structure -- pick a different name."
                    ),
                )
            group_id = existing["group_id"]
            storage.add_files_to_group(group_id, request.session_id, group.filenames)
            all_filenames = storage.list_permanent_files(group_id)
            status = "appended"
        else:
            # New save case -- introduces a new dataset, needs upload
            # permission.
            authz.require_upload_permission(request.workspace_id, user_id)

            group_id = storage.save_group(
                request.session_id, group.name, group.filenames, group.headers
            )
            database.create_group(group_id, request.workspace_id, user_id, group.name, group.headers)
            all_filenames = group.filenames
            status = "created"

        # Recombine the group's FULL current file set (old + new), since
        # permanent_storage is the source of truth, not group_readings.
        file_contents = [
            storage.get_file_from_permanent(group_id, filename).decode(
                "utf-8", errors="ignore"
            )
            for filename in all_filenames
        ]
        combined_df = processor.combine_group_files(file_contents, group.raw_header)

        # NEW -- combine_group_files builds every column straight from
        # split() tokens, so everything (temperature, VWC, etc.) is still
        # a string at this point. Convert every non-datetime column to
        # real numeric values now, once, at the source -- so stats,
        # sorting, and CSV export downstream all get actual numbers
        # instead of silently-failing string comparisons.
        combined_df = analytics.convert_columns(combined_df)

        if combined_df.empty:
            raise HTTPException(
                status_code=400,
                detail=f"'{group.name}': none of the files produced valid rows",
            )

        # Safe for both cases -- deleting zero existing rows for a brand
        # new group is a no-op, so replace_readings works either way.
        database.replace_readings(group_id, combined_df)

        saved_filenames.extend(group.filenames)
        results.append({
            "name": group.name,
            "group_id": group_id,
            "status": status,
            "row_count": len(combined_df),
        })

    # Only the files actually saved get cleaned up now -- anything left
    # unchecked in this session is caught later by the periodic sweep.
    storage.delete_specific_files(request.session_id, saved_filenames)

    return {"groups": results}


# ---------------------------------------------------------------------
# Reading groups back out. List for the switcher/History, "active" for
# the auto-load-on-workspace-open behavior, and per-group readings for
# the graphs/stats/table components to actually render. Every one of
# these is scoped to a workspace the caller has been verified to belong
# to -- either explicitly (list/active) or derived from the group itself
# (everything else), never from a workspace_id taken at face value.
# ---------------------------------------------------------------------

@app.get("/groups")
def list_groups(
    workspace_id: str = Query(...),
    user_id: str = Depends(auth.get_current_user_id),
):
    """Every saved group in this workspace -- powers the group switcher
    and History page (search/view/delete)."""
    authz.require_workspace_member(workspace_id, user_id)
    return {"groups": database.list_groups(workspace_id)}


@app.get("/groups/active")
def get_active_group(
    workspace_id: str = Query(...),
    user_id: str = Depends(auth.get_current_user_id),
):
    """The group Home should auto-load when this workspace opens:
    whichever one was most recently viewed, or null if the workspace has
    no groups yet (brand new workspace -> Home shows the upload flow
    instead)."""
    authz.require_workspace_member(workspace_id, user_id)
    return {"group": database.get_most_recently_viewed_group(workspace_id)}


@app.get("/groups/{group_id}/readings")
def get_group_readings(
    group_id: str,
    hours: float = Query(default=24),
    user_id: str = Depends(auth.get_current_user_id),
):
    """A group's readings within the given time window (anchored to the
    data's own latest timestamp, not real-world now -- see
    get_latest_reading_time). Also marks this group as the most recently
    viewed one, since fetching its readings means the user is looking
    at it right now."""
    group, _ = authz.get_group_for_member(group_id, user_id)

    database.touch_last_viewed(group_id)

    readings = database.get_readings(group_id, hours)
    # Flatten the JSONB "data" blob back into a plain row per reading --
    # the frontend components expect {datetime, T01: ..., VWC1: ...},
    # not {datetime, data: {T01: ..., VWC1: ...}}.
    rows = [{"datetime": r["datetime"], **r["data"]} for r in readings]

    return {"group": group, "rows": rows}


@app.delete("/groups/{group_id}")
def delete_group(
    group_id: str,
    user_id: str = Depends(auth.get_current_user_id),
):
    """Deletes a group entirely -- its permanent_storage files, its
    group_readings rows (cascade via foreign key), and its groups row.
    Called from History's Delete action. Requires modify permission --
    deleting is the most destructive form of "altering existing data"."""
    group, _ = authz.get_group_for_modify(group_id, user_id)

    storage.delete_permanent_group(group_id)
    database.delete_group(group_id)

    return {"deleted": group_id}


@app.get("/groups/{group_id}/files")
def list_group_files(
    group_id: str,
    user_id: str = Depends(auth.get_current_user_id),
):
    """Lists the individual files behind a group -- powers History's
    expanded per-file view."""
    authz.get_group_for_member(group_id, user_id)
    return {"files": storage.list_permanent_files(group_id)}


@app.get("/groups/{group_id}/sample")
def get_group_sample(
    group_id: str,
    limit: int = Query(default=3),
    user_id: str = Depends(auth.get_current_user_id),
):
    """A handful of a group's existing, already-labeled readings --
    used by the headerless-file resolver to show a real side-by-side
    comparison next to an uploaded file that might match this group."""
    authz.get_group_for_member(group_id, user_id)

    sample = database.get_group_sample(group_id, limit=limit)
    rows = [{"datetime": r["datetime"], **r["data"]} for r in sample]
    return {"rows": rows}


class RenameGroupRequest(BaseModel):
    name: str


@app.patch("/groups/{group_id}")
def rename_group(
    group_id: str,
    request: RenameGroupRequest,
    user_id: str = Depends(auth.get_current_user_id),
):
    """Renames a group. Rejects an empty name and rejects a collision
    with another group in the same workspace (name stays unique per
    workspace). Requires modify permission."""
    group, _ = authz.get_group_for_modify(group_id, user_id)

    new_name = request.name.strip()
    if new_name == "":
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    existing = database.get_group_by_name(group["workspace_id"], new_name)
    if existing is not None and existing["group_id"] != group_id:
        raise HTTPException(status_code=409, detail=f"A group named '{new_name}' already exists")

    database.rename_group(group_id, new_name)
    return {"group_id": group_id, "name": new_name}


@app.delete("/groups/{group_id}/files/{filename}")
def delete_group_file(
    group_id: str,
    filename: str,
    user_id: str = Depends(auth.get_current_user_id),
):
    """Removes a single file from a group. The remaining files are
    recombined so group_readings stays in sync -- permanent_storage is
    always the source of truth, readings is just a derived cache. If
    that was the group's last file, the whole group is deleted instead
    of leaving an empty shell behind. Requires modify permission.

    Note: raw_header (the column structure needed to recombine) was
    never stored anywhere -- it only ever passed through the original
    upload/save request. Since every file in a group shares the same
    header by definition, it's re-derived here from whichever file
    remains, rather than needing a schema change to persist it."""
    authz.get_group_for_modify(group_id, user_id)

    storage.delete_files_from_group(group_id, [filename])
    remaining = storage.list_permanent_files(group_id)

    if not remaining:
        database.delete_group(group_id)
        return {"group_deleted": True, "files": []}

    file_contents = [
        storage.get_file_from_permanent(group_id, f).decode("utf-8", errors="ignore")
        for f in remaining
    ]
    raw_header = validator.extract_header(file_contents[0])["raw"]

    combined_df = processor.combine_group_files(file_contents, raw_header)
    combined_df = analytics.convert_columns(combined_df)

    if combined_df.empty:
        raise HTTPException(
            status_code=500,
            detail="Could not recombine the remaining files after deletion",
        )

    database.replace_readings(group_id, combined_df)

    return {"group_deleted": False, "files": remaining, "row_count": len(combined_df)}
