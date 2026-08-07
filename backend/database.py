# This file's purpose is to handle all Supabase Postgres (database) concerns:
# creating/looking up/listing groups, and inserting/replacing/fetching their
# combined readings. It does not touch Supabase Storage (see storage.py) and
# does not parse or combine raw files (see processor.py) — it only receives
# an already-built DataFrame from the orchestrator (app.py) and stores it.

import os
import pandas as pd
from datetime import datetime, timedelta
from dateutil import parser as date_parser
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

GROUPS_TABLE = "groups"
READINGS_TABLE = "group_readings"
INSERT_CHUNK_SIZE = 500  # rows per insert call, keeps payloads reasonable


def create_group(group_id: str, user_id: str, name: str, headers: list[str]) -> str:
    """Creates a new group row for a group_id that storage.py's save_group
    already generated (that's the same ID used for the permanent_storage
    folder — this function must reuse it, not mint a new one, or the
    files and the database row would point at two different groups)."""
    supabase.table(GROUPS_TABLE).insert({
        "group_id": group_id,
        "user_id": user_id,
        "name": name,
        "headers": headers,
    }).execute()
    return group_id


def get_group(group_id: str) -> dict | None:
    """Fetches a single group's metadata by group_id. Used once a user
    selects a specific group from history, to label the page/graphs
    before its readings are loaded."""
    result = (
        supabase.table(GROUPS_TABLE)
        .select("*")
        .eq("group_id", group_id)
        .execute()
    )
    rows = result.data
    return rows[0] if rows else None


def get_group_by_name(user_id: str, name: str) -> dict | None:
    """Looks up an existing group by (user_id, name), case-insensitive.
    Used to decide new-save vs. append when the user names a group."""
    result = (
        supabase.table(GROUPS_TABLE)
        .select("*")
        .eq("user_id", user_id)
        .ilike("name", name)
        .execute()
    )
    rows = result.data
    return rows[0] if rows else None


def list_groups(user_id: str) -> list[dict]:
    """Returns all of a user's saved groups (group_id, name, headers,
    created_at) — powers the history/search view."""
    result = (
        supabase.table(GROUPS_TABLE)
        .select("group_id, name, headers, created_at, last_viewed_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


def df_to_reading_rows(group_id: str, df: pd.DataFrame) -> list[dict]:
    """Converts a combined DataFrame (from processor.py) into row dicts
    ready for insertion: datetime becomes its own column, everything
    else is folded into the data JSONB column.

    NaN values (missing/invalid readings -- e.g. from
    analytics.convert_columns coercing a bad value) are converted to
    None first. JSON has no NaN; leaving them as float('nan') crashes
    the insert at serialization time with "Out of range float values
    are not JSON compliant". None serializes cleanly to JSON null,
    which is also the correct meaning here: a missing value."""
    clean_df = df.astype(object).where(pd.notna(df), None)

    records = []
    for row in clean_df.to_dict(orient="records"):
        dt = row.pop("datetime")
        records.append({
            "group_id": group_id,
            "datetime": dt.isoformat(),
            "data": row,
        })
    return records


def insert_readings(group_id: str, df: pd.DataFrame) -> None:
    """Inserts a DataFrame's rows for a group, in chunks."""
    rows = df_to_reading_rows(group_id, df)
    for i in range(0, len(rows), INSERT_CHUNK_SIZE):
        chunk = rows[i:i + INSERT_CHUNK_SIZE]
        supabase.table(READINGS_TABLE).insert(chunk).execute()


def replace_readings(group_id: str, df: pd.DataFrame) -> None:
    """Deletes a group's existing readings and inserts the freshly
    recombined set. Called after adding or removing a file from a group,
    since permanent_storage stays the source of truth and readings is
    just a derived cache."""
    supabase.table(READINGS_TABLE).delete().eq("group_id", group_id).execute()
    insert_readings(group_id, df)


def get_latest_reading_time(group_id: str) -> datetime | None:
    """Returns the most recent datetime among a group's readings, or None
    if it has no readings yet. Used as the anchor point for time-window
    filtering — filtering is relative to the data's own latest timestamp,
    not to now(), since uploaded data may not be recent."""
    result = (
        supabase.table(READINGS_TABLE)
        .select("datetime")
        .eq("group_id", group_id)
        .order("datetime", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data
    if not rows:
        return None
    return date_parser.isoparse(rows[0]["datetime"])


def get_readings(group_id: str, hours: float | None = None) -> list[dict]:
    """Fetches a group's readings, sorted by time. If hours is given,
    only returns readings within that many hours of the group's latest
    reading (not the current time). If hours is None (default), returns
    everything."""
    query = supabase.table(READINGS_TABLE).select("datetime, data").eq("group_id", group_id)

    if hours is not None:
        latest = get_latest_reading_time(group_id)
        if latest is not None:
            cutoff = latest - timedelta(hours=hours)
            query = query.gte("datetime", cutoff.isoformat())

    result = query.order("datetime").execute()
    return result.data


def delete_group(group_id: str) -> None:
    """Deletes a group's row; group_readings rows cascade automatically
    via the foreign key. Does not touch permanent_storage — call
    storage.py separately to remove the underlying files."""
    supabase.table(GROUPS_TABLE).delete().eq("group_id", group_id).execute()


# ---------------------------------------------------------------------
# NEW -- "most recently viewed" tracking, so Home can auto-load whatever
# the user was actually last looking at (not just whatever was created
# most recently, which can differ once someone has more than one group).
# ---------------------------------------------------------------------

def touch_last_viewed(group_id: str) -> None:
    """Marks a group as the one currently being viewed. Called whenever a
    group becomes active on Home -- right now that's every time its
    readings are fetched; later this is also the group switcher and
    History's View action."""
    supabase.table(GROUPS_TABLE).update(
        {"last_viewed_at": datetime.utcnow().isoformat()}
    ).eq("group_id", group_id).execute()


def get_most_recently_viewed_group(user_id: str) -> dict | None:
    """Returns the user's most recently viewed group (by last_viewed_at),
    or None if they have no groups yet. Powers the auto-load-on-sign-in
    behavior on Home. New groups start with last_viewed_at = now() (a
    database default), so a freshly saved group is naturally "most
    recent" until something else gets viewed."""
    result = (
        supabase.table(GROUPS_TABLE)
        .select("*")
        .eq("user_id", user_id)
        .order("last_viewed_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data
    return rows[0] if rows else None


def get_group_sample(group_id: str, limit: int = 3) -> list[dict]:
    """Returns a handful of a group's existing readings (most recent
    first) -- used to show a real, labeled side-by-side comparison when
    the headerless-file resolver thinks an uploaded file matches this
    group, so the user has actual data to compare against instead of
    just a column count."""
    result = (
        supabase.table(READINGS_TABLE)
        .select("datetime, data")
        .eq("group_id", group_id)
        .order("datetime", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


def rename_group(group_id: str, name: str) -> None:
    """Renames a group. Name-uniqueness checking happens in app.py
    before this is called -- this function just writes the new name."""
    supabase.table(GROUPS_TABLE).update({"name": name}).eq("group_id", group_id).execute()