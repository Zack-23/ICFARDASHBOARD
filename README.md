# InsightLab (ICFAR Dashboard)

A research data platform for uploading, cleaning and exploring field sensor logs. It started as a single-file Streamlit prototype built during a Research Assistant role at Western's ICFAR, where sensor data was reviewed by hand in Excel. InsightLab replaces that with a multi-user web application: an ingestion pipeline that works for any sensor layout rather than one hardcoded dataset, and an analytics dashboard on top of it.

## What it does

Researchers upload raw sensor log files (`.txt`, whitespace-delimited, any column layout). The pipeline detects each file's header, groups files that share the same structure, drops malformed lines, converts readings to numeric types and loads them into PostgreSQL. Researchers then explore the data through time-series graphs, summary statistics and tables, without the app needing to know in advance which sensors a deployment used.

All data lives inside **workspaces**, so a research team can share datasets while each member gets only the permissions the owner grants them.

## How the ingestion pipeline works

1. **Upload.** Files are stored in a temporary Supabase Storage session (`temp_sessions`), one session per upload batch.
2. **Detect and group.** `validator.py` finds each file's header line, normalizes it and groups files with identical column structure. Files with no recognizable header are bucketed by their most common column count.
3. **Review.** The researcher chooses which groups to keep and names them. Headerless files are resolved one at a time: if their structure matches a group, the app shows a side-by-side preview of the file and a real sample from that group, and the researcher decides whether to include it. Nothing is matched or accepted silently.
4. **Clean and combine.** `processor.py` maps every column by position and keeps only lines whose token count exactly matches the header. This rejects the failure modes the field devices actually produce:
   - device timeout messages written in place of a reading (e.g. `Wire timeout occurred.`)
   - truncated lines cut off mid-reading
   - header rows repeated mid-file after a device reconnects
   - blank lines

   It then merges the date and time columns into one `datetime`, drops rows with unparseable timestamps, drops redundant columns and sorts by time. `analytics.py` converts the sensor values to numeric types.
5. **Load.** Raw files move to `permanent_storage`, and the cleaned readings are inserted into `group_readings` in batches of 500 rows.

**Source of truth:** `permanent_storage` always holds the original, uncombined files. `group_readings` is a derived cache. When files are added to or removed from a group, the group is fully recombined from its raw files and its readings are replaced, never patched in place. That means any group can be reprocessed if the cleaning rules change.

## Features

**Authentication and access control**
- Google OAuth via Supabase Auth
- Every endpoint verifies the Supabase JWT server-side and never trusts a client-supplied user ID
- Workspace-level authorization (`authz.py`) checks membership and permissions on every group, upload session and invite operation

**Workspaces and sharing**
- New users create or join a workspace before anything else. Returning users land in the workspace they last used, and a switcher moves between workspaces.
- Owners share access through invite links, setting permissions when the link is created: upload files, and/or modify datasets (rename, append, delete)
- Invite tokens are stored only as SHA-256 hashes, expire automatically and can be revoked
- Owners can change members' permissions or remove them. The database enforces exactly one owner per workspace.

**Data organization**
- Automatic header detection and grouping of files by column structure
- Group names are unique per user (case-insensitive) so files can be appended to a group by name without ambiguity
- Groups can be renamed, appended to or deleted, as a whole or file by file, with automatic recombination of the remaining data

**Visualization**
- Individual Graph and Overlay Graph (dual axis, comparing two sensor families), both time-anchored
- Line, Area and Points rendering styles
- Gaps in the data, such as a sensor outage, render as a visible break and are never smoothed over
- Time windows (24h, 3d, 7d, 14d) anchored to the dataset's latest reading, not the current clock, so older field data still displays
- A "column family" abstraction groups related sensor columns (e.g. `T01` to `T08`, `VWC1` to `VWC4`) by stripping their numeric part. The same logic drives graphs, statistics and tables, so the app works for any sensor layout.

**Statistics**
- Single-metric view, full statistics table (mean, median, min, max, standard deviation, quartiles) and box plots, computed client-side

**History**
- Searchable, paginated list of saved datasets
- Folder-style drill-down into a dataset's individual files, with per-file add and delete

**Data export**
- Download original uploaded files, or a dataset's full combined history as CSV

**Settings**
- Workspace settings (members, permissions, invites) for owners
- Persisted default time-window preference

## Tech stack

- **Backend:** Python, FastAPI, pandas
- **Database and storage:** Supabase (PostgreSQL, Object Storage, Auth)
- **Frontend:** React (Vite), Recharts
- **Styling:** custom dark navy and cyan design system, no CSS framework
- **Deployment:** Docker, Azure Container Apps (backend), Azure Static Web Apps (frontend), GitHub Actions CI/CD

## Architecture

The backend is split by concern. `app.py` (project root) defines the FastAPI routes and is the only file that wires the others together. The rest live in `backend/`:

| File | Responsibility |
|---|---|
| `app.py` | FastAPI routes; orchestrates everything else |
| `backend/auth.py` | Verifies Supabase Auth JWTs |
| `backend/authz.py` | Workspace membership and permission checks |
| `backend/workspaces.py` | Workspaces, members, invites (hashed tokens), active-workspace preference |
| `backend/validator.py` | Detects headers, groups files by structure, buckets headerless files |
| `backend/processor.py` | Cleans and combines a group's raw files into one DataFrame |
| `backend/analytics.py` | Numeric conversion, invalid-row detection, column families |
| `backend/storage.py` | Supabase Storage operations, with retries for transient network errors and upsert on re-upload |
| `backend/database.py` | PostgreSQL operations (groups, batched reading inserts, time-window queries) |
| `backend/schemas.py` | Request and response models |
| `backend/migrations/` | SQL migrations that added workspaces to an existing single-user database without data loss |

The frontend is built around a persistent sidebar shell (`Home.jsx`) that switches between Upload, Workspace, History and Settings. Shared utilities (`columnFamilies.js`, `timeWindows.js`) keep the graph, statistics and table components consistent. `UseAuth` and `UseWorkspace` hooks hold the session and active workspace.

## Data model

| Table | Purpose |
|---|---|
| `workspaces` | A team's shared space |
| `workspace_members` | Membership, role (`owner` or `member`) and permissions (`can_upload`, `can_modify_datasets`) |
| `workspace_invites` | Invite links: hashed token, permissions granted, expiry, revocation |
| `groups` | A named dataset: its workspace, creator and normalized headers |
| `group_readings` | Cleaned readings: `group_id`, `datetime`, and a `data` JSONB column |
| `upload_sessions` | Temporary upload batches, scoped to a user and workspace |
| `user_preferences` | Each user's active workspace |

Readings use a JSONB column because each site's sensor set is different, so a fixed-column table would not fit every group. A composite index on `(group_id, datetime)` keeps time-window queries fast. Foreign keys cascade, so deleting a workspace or group removes everything under it. Row Level Security is enabled on every table, and all access goes through the backend.

## Setup

### Backend
Run from the project root (where `app.py` is):

```bash
pip install -r requirements.txt
uvicorn app:app --reload --port 8001
```

Requires a `.env` file in `backend/`:
```
SUPABASE_URL=your-project-url
SUPABASE_KEY=your-service-role-key
```

RLS is enabled with no public policies, so the backend needs the service-role key. Keep it server-side only and never expose it to the frontend.

To run the backend in Docker:
```bash
docker build -t insightlab-api .
docker run -p 8001:8001 --env-file backend/.env insightlab-api
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

### Supabase
- **Database:** load the schema (all tables, indexes, foreign keys and RLS). To upgrade an older single-user database, run the migrations in `backend/migrations/` in order; see that folder's README.
- **Storage buckets:** `temp_sessions` and `permanent_storage`
- **Auth:** enable the Google provider and add the frontend's dev and production URLs to the allowed redirect URLs

## Deployment

- **Backend:** containerized with the root `Dockerfile` and deployed to Azure Container Apps (Consumption plan, which scales to zero when idle and suits low, bursty research traffic)
- **Frontend:** deployed to Azure Static Web Apps by GitHub Actions on every push to `main`. Supabase settings and the API URL are supplied as repository secrets.

## Known limitations

- **Reading inserts are not transactional.** Readings are inserted in 500-row batches, so if a batch fails partway through a save, the group can be left with incomplete data. The planned fix is to wrap each save in a single database transaction.
- **No scheduled cleanup yet.** Temporary upload sessions that are never saved are not cleaned up automatically. The delete function exists, but no scheduled job runs it yet.
- **Google sign-in only.** Email and password login is deferred until someone needs it.
- **Structure-based validation only.** The pipeline checks that each line has the right structure, not that its values are plausible. There is no automated anomaly or outlier detection yet.
- **No cross-group comparison view yet.**
- **No automated test suite yet.**
