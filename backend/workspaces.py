

import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

WORKSPACES_TABLE = "workspaces"
MEMBERS_TABLE = "workspace_members"
INVITES_TABLE = "workspace_invites"
UPLOAD_SESSIONS_TABLE = "upload_sessions"
PREFERENCES_TABLE = "user_preferences"

INVITE_DEFAULT_TTL_DAYS = 7


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------
# Workspaces
# ---------------------------------------------------------------------

def create_workspace(name: str, description: str | None, created_by: str) -> dict:

    workspace = (
        supabase.table(WORKSPACES_TABLE)
        .insert({"name": name, "description": description, "created_by": created_by})
        .execute()
    ).data[0]

    supabase.table(MEMBERS_TABLE).insert({
        "workspace_id": workspace["workspace_id"],
        "user_id": created_by,
        "role": "owner",
        "can_upload": True,
        "can_modify_datasets": True,
    }).execute()

    return workspace


def get_workspace(workspace_id: str) -> dict | None:
    result = (
        supabase.table(WORKSPACES_TABLE)
        .select("*")
        .eq("workspace_id", workspace_id)
        .execute()
    )
    rows = result.data
    return rows[0] if rows else None


def update_workspace(workspace_id: str, name: str | None, description: str | None) -> dict:
    updates = {"updated_at": _now()}
    if name is not None:
        updates["name"] = name
    if description is not None:
        updates["description"] = description
    result = (
        supabase.table(WORKSPACES_TABLE)
        .update(updates)
        .eq("workspace_id", workspace_id)
        .execute()
    )
    return result.data[0]


def delete_workspace(workspace_id: str) -> None:

    supabase.table(WORKSPACES_TABLE).delete().eq("workspace_id", workspace_id).execute()


def list_user_workspaces(user_id: str) -> list[dict]:

    result = (
        supabase.table(MEMBERS_TABLE)
        .select("role, can_upload, can_modify_datasets, joined_at, workspaces(*)")
        .eq("user_id", user_id)
        .execute()
    )
    result_workspaces = []
    for row in result.data:
        ws = row.pop("workspaces")
        if ws is None:
            continue
        result_workspaces.append({**ws, **row})
    result_workspaces.sort(key=lambda w: w["created_at"], reverse=True)
    return result_workspaces


# ---------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------

def get_membership(workspace_id: str, user_id: str) -> dict | None:
    result = (
        supabase.table(MEMBERS_TABLE)
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
    )
    rows = result.data
    return rows[0] if rows else None


def list_members(workspace_id: str) -> list[dict]:
    result = (
        supabase.table(MEMBERS_TABLE)
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("joined_at")
        .execute()
    )
    return result.data


def update_member_permissions(workspace_id: str, user_id: str, can_upload: bool, can_modify_datasets: bool) -> dict:

    result = (
        supabase.table(MEMBERS_TABLE)
        .update({"can_upload": can_upload, "can_modify_datasets": can_modify_datasets})
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .eq("role", "member")
        .execute()
    )
    return result.data[0] if result.data else None


def remove_member(workspace_id: str, user_id: str) -> None:

    supabase.table(MEMBERS_TABLE).delete().eq("workspace_id", workspace_id).eq("user_id", user_id).eq(
        "role", "member"
    ).execute()


def add_member(workspace_id: str, user_id: str, can_upload: bool, can_modify_datasets: bool) -> dict:

    result = (
        supabase.table(MEMBERS_TABLE)
        .insert({
            "workspace_id": workspace_id,
            "user_id": user_id,
            "role": "member",
            "can_upload": can_upload,
            "can_modify_datasets": can_modify_datasets,
        })
        .execute()
    )
    return result.data[0]


def get_user_emails(user_ids: list[str]) -> dict[str, str]:

    emails: dict[str, str] = {}
    for user_id in set(user_ids):
        try:
            response = supabase.auth.admin.get_user_by_id(user_id)
            if response and response.user:
                emails[user_id] = response.user.email
        except Exception:
            continue
    return emails


# invites below logic

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_invite(workspace_id: str, created_by: str, can_upload: bool, can_modify_datasets: bool) -> tuple[dict, str]:

    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=INVITE_DEFAULT_TTL_DAYS)).isoformat()

    row = (
        supabase.table(INVITES_TABLE)
        .insert({
            "workspace_id": workspace_id,
            "token_hash": _hash_token(token),
            "can_upload": can_upload,
            "can_modify_datasets": can_modify_datasets,
            "created_by": created_by,
            "expires_at": expires_at,
        })
        .execute()
    ).data[0]

    return row, token


def get_invite_by_token(token: str) -> dict | None:
    result = (
        supabase.table(INVITES_TABLE)
        .select("*")
        .eq("token_hash", _hash_token(token))
        .execute()
    )
    rows = result.data
    return rows[0] if rows else None


def list_invites(workspace_id: str) -> list[dict]:

    result = (
        supabase.table(INVITES_TABLE)
        .select("invite_id, workspace_id, can_upload, can_modify_datasets, created_at, expires_at, revoked_at")
        .eq("workspace_id", workspace_id)
        .is_("revoked_at", "null")
        .gt("expires_at", _now())
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


def revoke_invite(workspace_id: str, invite_id: str) -> None:
    supabase.table(INVITES_TABLE).update({"revoked_at": _now()}).eq("workspace_id", workspace_id).eq(
        "invite_id", invite_id
    ).execute()


def invite_status(invite: dict) -> str:

    if invite["revoked_at"] is not None:
        return "revoked"
    expires_at = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
    if expires_at < datetime.now(timezone.utc):
        return "expired"
    return "valid"


# upload session


def create_upload_session(user_id: str, workspace_id: str) -> str:

    session_id = str(uuid.uuid4())
    supabase.table(UPLOAD_SESSIONS_TABLE).insert({
        "session_id": session_id,
        "user_id": user_id,
        "workspace_id": workspace_id,
    }).execute()
    return session_id


def get_upload_session(session_id: str) -> dict | None:
    result = (
        supabase.table(UPLOAD_SESSIONS_TABLE)
        .select("*")
        .eq("session_id", session_id)
        .execute()
    )
    rows = result.data
    return rows[0] if rows else None


def delete_upload_session(session_id: str) -> None:
    supabase.table(UPLOAD_SESSIONS_TABLE).delete().eq("session_id", session_id).execute()


# workspace preference

def get_active_workspace_id(user_id: str) -> str | None:
    result = (
        supabase.table(PREFERENCES_TABLE)
        .select("active_workspace_id")
        .eq("user_id", user_id)
        .execute()
    )
    rows = result.data
    return rows[0]["active_workspace_id"] if rows else None


def set_active_workspace(user_id: str, workspace_id: str | None) -> None:
    supabase.table(PREFERENCES_TABLE).upsert({
        "user_id": user_id,
        "active_workspace_id": workspace_id,
        "updated_at": _now(),
    }).execute()



