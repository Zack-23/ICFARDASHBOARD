# ICFAR Dashboard

A research data platform for uploading, organizing, and exploring sensor log data. Built to replace an earlier single-file Streamlit prototype with a real, multi-user web application — file ingestion that generalizes across arbitrary sensor configurations rather than being hardcoded to one dataset, and a full analytics dashboard on top of it.

## What it does

Researchers upload raw sensor log files (`.txt`, arbitrary column layouts). The app automatically detects headers, groups files by matching structure, and combines them into clean, queryable datasets. From there, it offers time-series visualization, summary statistics, and full data management — without needing to know in advance what sensors a given deployment used.

## Features

**Authentication**
- Google OAuth via Supabase Auth
- Every backend endpoint independently verifies the JWT server-side — no endpoint trusts a client-supplied user ID

**Upload & file organization**
- Automatic header detection and grouping of files by matching column structure
- Headerless-file resolution: files with no recognizable header are checked against existing groups (matched by structure, with a real side-by-side data preview) or can be manually defined as a new group — fully trust-based, nothing is silently guessed or auto-validated
- Groups can be renamed, appended to, or deleted (as a whole, or file-by-file, with automatic recombination of whatever data remains)

**Visualization**
- Individual Graph and Overlay Graph (dual-axis, two-family comparison), both time-anchored
- Line, Area, and Points rendering styles
- Gaps in the data (e.g. a sensor outage) render as a visible break, never smoothed over
- Time-range brush for zooming into a specific window
- A "column family" abstraction automatically groups related sensor columns (e.g. `T01`–`T08`) by stripping numeric suffixes — the same logic drives graphs, statistics, and tables, so the app works for any sensor layout, not just one dataset

**Statistics**
- Single-metric view, full stats table, and box plot, computed client-side

**History**
- Searchable, paginated list of saved datasets
- Folder-style drill-down into a dataset's individual files, with per-file add/delete

**Settings**
- Persisted default time-window preference

**Data export**
- Download original uploaded files or a dataset's full combined history as CSV

## Tech stack

- **Backend:** Python, FastAPI, pandas
- **Database & storage:** Supabase (Postgres + Object Storage + Auth)
- **Frontend:** React (Vite), Recharts
- **Styling:** Custom dark navy/cyan design system, no CSS framework

## Architecture

The backend is split by concern, with `app.py` as the only file that wires the others together:

| File | Responsibility |
|---|---|
| `app.py` | FastAPI routes; orchestrates everything else |
| `auth.py` | Verifies Supabase Auth JWTs |
| `validator.py` | Detects headers, groups files by structure |
| `processor.py` | Combines raw files into a single DataFrame |
| `storage.py` | Supabase Storage operations, with retry handling for transient network errors |
| `database.py` | Supabase Postgres operations |
| `analytics.py` | Numeric conversion and statistics |

`permanent_storage` (raw files) is always the source of truth; the database's `group_readings` table is a derived cache that gets fully recombined and replaced whenever the underlying files change — never patched in place.

The frontend is organized around a persistent sidebar shell (`Home.jsx`) that switches between Upload, Workspace, History, and Settings, with shared utilities (`columnFamilies.js`, `timeWindows.js`) driving the graph/stats/table components consistently.

## Setup

### Backend
```bash
cd backend
pip install -r requirements.txt --break-system-packages
uvicorn app:app --reload --port 8001
```

Requires a `.env` file in `backend/`:
```
SUPABASE_URL=your-project-url
SUPABASE_KEY=your-service-role-or-anon-key
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Requires a `.env` file in `frontend/`:
```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_API_URL=http://localhost:8001
```

### Supabase setup
- **Tables:** `groups` (group_id, user_id, name, headers, created_at, last_viewed_at) and `group_readings` (group_id, datetime, data — JSONB)
- **Storage buckets:** `temp_sessions` and `permanent_storage`
- **Auth:** Google provider enabled, with the frontend's dev/prod URL added to allowed redirect URLs

## Known limitations

- Google OAuth only — no email/password login yet
- Single shared login model — no per-user data isolation
- No automated anomaly/outlier detection yet
- No cross-group comparison view yet

These are deliberate scope decisions for the current stage, not oversights.
