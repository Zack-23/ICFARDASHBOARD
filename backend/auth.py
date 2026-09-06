# This file's purpose is to verify Supabase Auth JWTs coming from the
# frontend and extract the authenticated user's id, so backend endpoints
# never have to trust a client-supplied user_id.

import os
from dotenv import load_dotenv
from fastapi import Header, HTTPException
from supabase import create_client

# reading from .env file supabase key we need.
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

# creating clients.
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_current_user_id(authorization: str = Header(...)) -> str:

    # This function purpose is to get user_id and return it.
    # This function will run before any end points and any fastapi functions that recieve error will
    # stop otherwise will continue with the user_id returned
    # will be raised before the FastAPI function runs.

    # not valid authorization
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        # verifty the token
        response = supabase.auth.get_user(token)
    except Exception:
        # if token is not valid or expired raise error
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # if nothing was returned.
    if response is None or response.user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # get user id.
    return response.user.id


# This function exists for when a workpace owner generates an invite link.
def get_optional_user_id(authorization: str = Header(default=None)) -> str | None:


    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.removeprefix("Bearer ").strip()

    try:
        response = supabase.auth.get_user(token)
    except Exception:
        return None

    if response is None or response.user is None:
        return None

    return response.user.id