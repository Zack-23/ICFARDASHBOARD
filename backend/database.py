

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


def create_group(group_id: str, workspace_id: str, user_id: str, name: str, headers: list[str]) -> str:


    supabase.table(GROUPS_TABLE).insert({
        "group_id": group_id,
        "workspace_id": workspace_id,
        "user_id": user_id,
        "name": name,
        "headers": headers,
    }).execute()
    return group_id


def get_group(group_id: str) -> dict | None:

    result = (
        supabase.table(GROUPS_TABLE)
        .select("*")
        .eq("group_id", group_id)
        .execute()
    )
    rows = result.data
    return rows[0] if rows else None


def get_group_by_name(workspace_id: str, name: str) -> dict | None:

    result = (
        supabase.table(GROUPS_TABLE)
        .select("*")
        .eq("workspace_id", workspace_id)
        .ilike("name", name)
        .execute()
    )
    rows = result.data
    return rows[0] if rows else None


def list_groups(workspace_id: str) -> list[dict]:

    result = (
        supabase.table(GROUPS_TABLE)
        .select("group_id, name, headers, created_at, last_viewed_at, user_id")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


def df_to_reading_rows(group_id: str, df: pd.DataFrame) -> list[dict]:

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

    rows = df_to_reading_rows(group_id, df)
    for i in range(0, len(rows), INSERT_CHUNK_SIZE):
        chunk = rows[i:i + INSERT_CHUNK_SIZE]
        supabase.table(READINGS_TABLE).insert(chunk).execute()


def replace_readings(group_id: str, df: pd.DataFrame) -> None:

    supabase.table(READINGS_TABLE).delete().eq("group_id", group_id).execute()
    insert_readings(group_id, df)


def get_latest_reading_time(group_id: str) -> datetime | None:

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

    query = supabase.table(READINGS_TABLE).select("datetime, data").eq("group_id", group_id)

    if hours is not None:
        latest = get_latest_reading_time(group_id)
        if latest is not None:
            cutoff = latest - timedelta(hours=hours)
            query = query.gte("datetime", cutoff.isoformat())

    result = query.order("datetime").execute()
    return result.data


def delete_group(group_id: str) -> None:

    supabase.table(GROUPS_TABLE).delete().eq("group_id", group_id).execute()



# ---------------------------------------------------------------------

def touch_last_viewed(group_id: str) -> None:

    supabase.table(GROUPS_TABLE).update(
        {"last_viewed_at": datetime.utcnow().isoformat()}
    ).eq("group_id", group_id).execute()


def get_most_recently_viewed_group(workspace_id: str) -> dict | None:

    result = (
        supabase.table(GROUPS_TABLE)
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("last_viewed_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data
    return rows[0] if rows else None


def get_group_sample(group_id: str, limit: int = 3) -> list[dict]:

    result = (
        supabase.table(READINGS_TABLE)
        .select("datetime, data")
        .eq("group_id", group_id)
        .order("datetime", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


def list_group_ids(workspace_id: str) -> list[str]:

    result = (
        supabase.table(GROUPS_TABLE)
        .select("group_id")
        .eq("workspace_id", workspace_id)
        .execute()
    )
    return [row["group_id"] for row in result.data]


def rename_group(group_id: str, name: str) -> None:

    supabase.table(GROUPS_TABLE).update({"name": name}).eq("group_id", group_id).execute()