from datetime import datetime, timedelta, timezone
from dateutil import parser as date_parser
# This file handles all database operations, such us creatings groups,
# deleting groups, and showcasing listings.

import os



import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

GROUPS_TABLE = "groups"
READINGS_TABLE = "group_readings"
INSERT_CHUNK_SIZE = 500

def create_group(group_id: str, user_id: str, name: str, headers: list[str]) -> str:

    # This function creates a new row for group using the paramaters passed.
    # each upload gets one row in group table and returns group_id.
    supabase.table(GROUPS_TABLE).insert({
        "user_id": user_id,
        "group_id": group_id,
        "name": name,
        "headers": headers,
    }).execute()

    return group_id

def get_group(group_id: str) -> dict | None:

    # This function grabs a specific row in groups table that matches the group_id.

    result  = (
        supabase.table(GROUPS_TABLE)
        .select("*")
        .eq("group_id", group_id)
        .execute()
    )
    rows = result.data
    if rows:
        return rows[0]
    else:
        return None


def get_group_by_name(user_id: str, name:str ) -> dict | None:
    # this function looks up existing group by name, and user id.
    result = (
        supabase.table(GROUPS_TABLE)
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    rows = result.data
    if rows:
        return rows[0]
    else:
        return None

def list_groups(user_id: str) -> list[dict]:
    # this function returns user all saved groups
    result = (
        supabase.table(GROUPS_TABLE)
        .select("group_id, name, headers, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data

def df_to_reading_rows(group_id: str, df: pd.DataFrame) -> list[dict]:
    # This function is responsible for storing the combined files in pandas
    # into the reading table, each row being saved here.
    # date time becomes its own column as its what we are going to use to determine what rows user needs

    records = []

    # code below we convert the panda tables to dictionaries, and make columns as the key, and
    dataframe_rows = df.to_dict(orient = "records")

    # Process one DataFrame row at a time.
    for row in dataframe_rows:
        # Take datetime out because it has its own database column.
        datetime_value = row.pop("datetime")

        # Convert the Pandas Timestamp into a standard string.
        datetime_string = datetime_value.isoformat()

        # Build one row in the shape expected by Supabase.
        database_row = {
            "group_id": group_id,
            "datetime": datetime_string,
            "data": row,
        }

        # Add the completed database row to the list.
        records.append(database_row)

    return records

def insert_readings(group_id: str, df: pd.DataFrame) -> None:

    # this function is responsible for inserting rows in chunck sizes
    # into the reading table section.

    rows = df_to_reading_rows(group_id, df)
    for i in range(0, len(rows), INSERT_CHUNK_SIZE):
        chunk = rows[i : i + INSERT_CHUNK_SIZE]
        supabase.table(READINGS_TABLE).insert(chunk).execute()

def replace_readings(group_id: str, df: pd.DataFrame) -> None:
        """Deletes a group's existing readings and inserts the freshly
        recombined set. Called after adding or removing a file from a group,
        since permanent_storage stays the source of truth and readings is
        just a derived cache."""
        supabase.table(READINGS_TABLE).delete().eq("group_id", group_id).execute()
        insert_readings(group_id, df)

def get_latest_reading_time(group_id:str) -> datetime:
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
    # delete the group row which also automatically deletes group reading.
    supabase.table(GROUPS_TABLE).delete().eq("group_id", group_id).execute()





