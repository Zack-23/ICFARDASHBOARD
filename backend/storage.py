

import uuid
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
TEMP_BASE = "temp_sessions"

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
BUCKET_NAME = "temp_sessions"
BUCKET_PERMANENT = "permanent_storage"
# connect to supabase
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def create_session():
    # generate a unique session id for each upload
    return str(uuid.uuid4())


# this function is a generic helper to upload files in any bucket.
def upload_files_to_bucket(bucket_name: str, session_id: str, filename: str, contents: bytes):
    path = f"{session_id}/{filename}"
    supabase.storage.from_(bucket_name).upload(
        path,
        contents,
        {"content-type": "text/plain"}
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

def get_file_from_session(session_id: str, filename: str) -> bytes:
    # read file from storage and return it
    path = f"{session_id}/{filename}"
    return supabase.storage.from_(BUCKET_NAME).download(path)

def get_file_from_permanent(session_id: str, filename: str) -> bytes:
    path = f"{session_id}/{filename}"
    return supabase.storage.from_(BUCKET_PERMANENT).download(path)

def list_session_files(session_id: str) -> list:
    files = supabase.storage.from_(BUCKET_NAME).list(session_id)
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
        supabase.storage.from_(BUCKET_NAME).remove(paths)

# come back to this
def delete_session(session_id: str) -> None:
    """Deletes all remaining files under a session — used by cleanup sweep for abandoned sessions."""
    filenames = list_session_files(session_id)
    delete_specific_files(session_id, filenames)

