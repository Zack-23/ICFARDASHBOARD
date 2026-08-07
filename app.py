# This file's purpose is to be the one orchestrator that talks to React --
# it wires validator.py (grouping), processor.py (combining), storage.py
# (Supabase Storage), database.py (Supabase Postgres), analytics.py
# (numeric conversion + stats), and auth.py (verifying who's asking)
# together. None of those files know about each other; this is the only
# place that does.

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend import auth, validator, processor, storage, database, analytics

app = FastAPI()

# The frontend (Vite, default port 5173) runs on a different port than
# this backend, so CORS has to explicitly allow it. Add your real
# deployed domain here later too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
# Upload -- step 1: files land in a temp session, grouped by header
# structure. Nothing is saved permanently or combined yet -- that only
# happens once the user actually names a group (see /groups/save).
# ---------------------------------------------------------------------

@app.post("/upload")
async def upload_files(
    files: list[UploadFile] = File(...),
    user_id: str = Depends(auth.get_current_user_id),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files were uploaded")

    session_id = storage.create_session()

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
# types, and database.py stores the result.
# ---------------------------------------------------------------------

class GroupToSave(BaseModel):
    name: str
    headers: list[str]       # normalized headers, as returned by /upload
    raw_header: list[str]    # original raw tokens, needed by processor.py
    filenames: list[str]     # which files (from this session) belong here


class SaveGroupsRequest(BaseModel):
    session_id: str
    groups: list[GroupToSave]


@app.post("/groups/save")
def save_groups(
    request: SaveGroupsRequest,
    user_id: str = Depends(auth.get_current_user_id),
):
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
        existing = database.get_group_by_name(user_id, group.name)

        if existing is not None:
            # Append case: same name already exists. Refuse silently
            # mismatched structure rather than corrupting the group's data.
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
            # New save case.
            group_id = storage.save_group(
                request.session_id, group.name, group.filenames, group.headers
            )
            database.create_group(group_id, user_id, group.name, group.headers)
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
# the auto-load-on-sign-in behavior, and per-group readings for the
# graphs/stats/table components to actually render.
# ---------------------------------------------------------------------

@app.get("/groups")
def list_groups(user_id: str = Depends(auth.get_current_user_id)):
    """Every saved group for this user -- powers the group switcher and
    History page (search/view/delete)."""
    return {"groups": database.list_groups(user_id)}


@app.get("/groups/active")
def get_active_group(user_id: str = Depends(auth.get_current_user_id)):
    """The group Home should auto-load on sign-in: whichever one this
    user looked at most recently, or null if they have no groups yet
    (brand new user -> Home shows the upload flow instead)."""
    return {"group": database.get_most_recently_viewed_group(user_id)}


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
    group = database.get_group(group_id)

    # 404, not 403 -- don't confirm to a caller whether a group_id
    # belonging to someone else even exists.
    if group is None or group["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Group not found")

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
    Called from History's Delete action."""
    group = database.get_group(group_id)
    if group is None or group["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Group not found")

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
    group = database.get_group(group_id)
    if group is None or group["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Group not found")

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
    group = database.get_group(group_id)
    if group is None or group["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Group not found")

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
    with another one of the user's groups (name stays unique per user)."""
    group = database.get_group(group_id)
    if group is None or group["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Group not found")

    new_name = request.name.strip()
    if new_name == "":
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    existing = database.get_group_by_name(user_id, new_name)
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
    of leaving an empty shell behind.

    Note: raw_header (the column structure needed to recombine) was
    never stored anywhere -- it only ever passed through the original
    upload/save request. Since every file in a group shares the same
    header by definition, it's re-derived here from whichever file
    remains, rather than needing a schema change to persist it."""
    group = database.get_group(group_id)
    if group is None or group["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Group not found")

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