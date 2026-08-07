# This file's purpose is to verify Supabase Auth JWTs coming from the
# frontend and extract the authenticated user's id, so backend endpoints
# never have to trust a client-supplied user_id.

import os
from dotenv import load_dotenv
from fastapi import Header, HTTPException
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_current_user_id(authorization: str = Header(...)) -> str:
    """FastAPI dependency. Verifies the Bearer token against Supabase Auth
    and returns the authenticated user's id. Raises 401 if the header is
    missing/malformed or the token is invalid/expired.

    Usage in app.py:

        from auth import get_current_user_id

        @app.get("/groups")
        def get_groups(user_id: str = Depends(get_current_user_id)):
            return database.list_groups(user_id)

    Every endpoint that currently needs user_id should get it this way
    instead of from a query param or request body -- a client could
    otherwise pass any user_id it wants and read someone else's groups.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if response is None or response.user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return response.user.id