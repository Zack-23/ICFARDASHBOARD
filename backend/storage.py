import time
import uuid
import os
from dotenv import load_dotenv
from supabase import create_client
import httpx

# Anchored to this file's own folder, same fix pattern as the earlier
# FileNotFoundError bug — makes this immune to being imported from a
# different working directory or as backend.storage from project root.
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
TEMP_BASE = "temp_sessions"

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
BUCKET_NAME = "temp_sessions"
BUCKET_PERMANENT = "permanent_storage"
# connect to supabase
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# NEW -- Supabase Storage requests occasionally fail with "Server
# disconnected" (httpx.RemoteProtocolError). This is connection-reuse
# flakiness talking to Supabase's storage service (often worse right
# after a paused project wakes back up), not an application bug -- the
# exact same call reliably succeeds moments later. Every direct call to
# supabase.storage below is wrapped with this so a transient network
# blip doesn't surface as a 500 to the user.
def _retry_storage_call(func, *args, retries=3, delay=0.75, **kwargs):
    last_error = None
    for attempt in range(retries):
        try:
            return func(*args, **kwargs)
        except httpx.RemoteProtocolError as e:
            last_error = e
            if attempt < retries - 1:
                time.sleep(delay)
    raise last_error


def create_session():
    # generate a unique session id for each upload
    return str(uuid.uuid4())


# this function is a generic helper to upload files in any bucket.
def upload_files_to_bucket(bucket_name: str, session_id: str, filename: str, contents: bytes):
    path = f"{session_id}/{filename}"
    # x-upsert lets a re-upload of the same path overwrite instead of
    # erroring -- important because re-adding a same-named file to a
    # group is always meant to replace its copy, not conflict with it
    # (and it makes retrying a partially-failed save safe, instead of
    # permanently stuck on "resource already exists").
    _retry_storage_call(
        supabase.storage.from_(bucket_name).upload,
        path,
        contents,
        {"content-type": "text/plain", "x-upsert": "true"},
    )
    return path

# the function below uploads files to temp storage bucket.
def save_file_to_session(session_id: str, filename: str, content: bytes) -> str:
    # this function handles uploading files to supabase under the session id.
    return upload_files_to_bucket(BUCKET_NAME, session_id, filename, content)

def save_file_to_permanent(session_id: str, filename: str, content: bytes) -> None:
    return upload_files_to_bucket(BUCKET_PERMANENT, session_id, filename, content)

# this file stores in permanent storage.
def save_group(session_id, names, files, headers):
    group_id = str(uuid.uuid4())
    for filename in files:
        content = get_file_from_session(session_id,filename)
        save_file_to_permanent(group_id, filename, content)
    return group_id

# NEW -- save_group() above always mints a brand new group_id, so it can
# only ever be used for a first-time save. Appending more files to a
# group a user already saved (same name, matching header) needs to land
# in that SAME group_id's permanent_storage folder instead, which is
# what app.py's /groups/save calls this for.
def add_files_to_group(group_id: str, session_id: str, filenames: list[str]) -> None:
    """Copies newly uploaded files (still sitting in the temp session) into
    an existing group's permanent storage folder — used when the user
    saves more files under a name that already exists."""
    for filename in filenames:
        content = get_file_from_session(session_id, filename)
        save_file_to_permanent(group_id, filename, content)

def get_file_from_session(session_id: str, filename: str) -> bytes:
    # read file from storage and return it
    path = f"{session_id}/{filename}"
    return _retry_storage_call(supabase.storage.from_(BUCKET_NAME).download, path)

def get_file_from_permanent(session_id: str, filename: str) -> bytes:
    path = f"{session_id}/{filename}"
    return _retry_storage_call(supabase.storage.from_(BUCKET_PERMANENT).download, path)

def list_session_files(session_id: str) -> list:
    files = _retry_storage_call(supabase.storage.from_(BUCKET_NAME).list, session_id)
    filename = []
    for f in files:
        file = f["name"]
        filename.append(file)
    return filename

def list_permanent_files(group_id: str) -> list:
    # lists every filename currently saved under a group_id in permanent
    # storage — needed to recombine a group's FULL file set (existing +
    # newly added) whenever a file is added or removed, since
    # permanent_storage is the source of truth, not group_readings.
    files = _retry_storage_call(supabase.storage.from_(BUCKET_PERMANENT).list, group_id)
    filename = []
    for f in files:
        file = f["name"]
        filename.append(file)
    return filename

def delete_specific_files(session_id: str, filenames: list[str]) -> None:
    # delete only specific files from temporary storage
    paths = []
    for filename in filenames:
        path = f"{session_id}/{filename}"
        paths.append(path)
    if paths:
        _retry_storage_call(supabase.storage.from_(BUCKET_NAME).remove, paths)

# come back to this
def delete_session(session_id: str) -> None:
    """Deletes all remaining files under a session — used by cleanup sweep for abandoned sessions."""
    filenames = list_session_files(session_id)
    delete_specific_files(session_id, filenames)

# NEW -- supports the History page's delete action: removes every file a
# group has in permanent storage. Called alongside database.delete_group()
# (which only removes the DB rows) so deleting a group cleans up both.
def delete_permanent_group(group_id: str) -> None:
    filenames = list_permanent_files(group_id)
    if not filenames:
        return
    paths = [f"{group_id}/{filename}" for filename in filenames]
    _retry_storage_call(supabase.storage.from_(BUCKET_PERMANENT).remove, paths)

# NEW -- supports removing individual files from a group (as opposed to
# delete_permanent_group, which wipes the whole group). Used when a user
# expands a group in History and deletes one file from it; the caller
# is responsible for recombining whatever files remain afterward.
def delete_files_from_group(group_id: str, filenames: list[str]) -> None:
    """Deletes specific files from a group's permanent storage folder."""
    paths = [f"{group_id}/{filename}" for filename in filenames]
    if paths:
        _retry_storage_call(supabase.storage.from_(BUCKET_PERMANENT).remove, paths)