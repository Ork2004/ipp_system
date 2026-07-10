# IPP System

A web platform for university departments that automates the preparation of individual teaching plans (ИПП) and related reporting forms.

Users upload an Excel file with teaching load data and a DOCX template of the plan. The system scans the template for placeholders, matches them against the load data (including dynamic `row.*` placeholders inside repeating loops), and generates a ready-to-use DOCX for each instructor — one at a time, in batches, or as a combined summary report.

## Features

- **Excel load upload** — parses the teaching-load spreadsheet with a configurable column mapping (load templates change from year to year; the mapping is saved and reused).
- **DOCX template upload** — scans placeholders, including repeating blocks (loops) for courses/groups.
- **IPP generation** — fills the template with load data and exports finished `.docx` files for one, several, or all instructors in a department.
- **Form 63 / Form 64** — dedicated generators for standard reporting forms built from the same source data.
- **Manual table editing** — edit individual plan cells without rebuilding from Excel, with snapshots preserved.
- **Generation history** — list and re-download previously generated files.
- **Load analytics** — summary statistics across instructors and courses.
- **Authentication** — login/password access, users are tied to a department.

## Tech stack

**Backend**
- FastAPI (Python), Uvicorn
- PostgreSQL, psycopg2 (connection pooling)
- pandas, openpyxl — Excel parsing
- python-docx, docxtpl — DOCX parsing and generation
- python-jose, passlib, bcrypt — authentication

**Frontend**
- React 19 + Vite
- react-router-dom, axios

Storage is hybrid: relational tables (departments, teachers, files) plus JSONB columns for flexible structures such as load rows and arbitrary template cells.

## Project structure

```
backend/
  app/
    api/          # FastAPI routers (auth, excel, docx, generate, form63, form64, ...)
    utils/        # Excel/DOCX parsers, report generators, column mapping
    uploads/       # uploaded and generated files (excel, docx, generated)
    config.py     # directory paths
    database.py   # PostgreSQL connection pool
    main.py       # FastAPI entry point
  requirements.txt
db/
  db_reset.sql    # full database schema (tables, indexes)
frontend/
  src/
    pages/        # pages (Excel/DOCX upload, generation, forms 63/64, settings, ...)
    components/   # shared components (navigation, etc.)
    api.js        # axios client
tools/            # helper scripts
```

## Requirements

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+

## Setup and running

### 1. Database

Create a PostgreSQL database and apply the full schema:

```bash
psql -U postgres -d ipp -f db/db_reset.sql
```

The script rebuilds the schema from scratch (a full reset) — do not run it against a database whose data you need to keep.

### 2. Backend

```bash
pip install -r backend/requirements.txt
```

Create `backend/.env` (see environment variables below), then start the server:

```bash
uvicorn backend.app.main:app --reload
```

- API: http://127.0.0.1:8000/
- Interactive docs (Swagger): http://127.0.0.1:8000/docs

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

- App: http://localhost:5173

### Environment variables (`backend/.env`)

| Variable      | Default      | Description                          |
|---------------|--------------|----------------------------------------|
| `DB_HOST`     | `localhost`  | PostgreSQL host                        |
| `DB_PORT`     | `5432`       | PostgreSQL port                        |
| `DB_NAME`     | `ipp`        | Database name                          |
| `DB_USER`     | `postgres`   | Database user                          |
| `DB_PASSWORD` | `postgres`   | Database password                      |
| `DB_POOL_MIN` | `1`          | Minimum connection pool size           |
| `DB_POOL_MAX` | `10`         | Maximum connection pool size           |

## API

All routes are wired up in [backend/app/api/\_\_init\_\_.py](backend/app/api/__init__.py) and are mounted under these prefixes:

| Prefix          | Purpose                                    |
|-----------------|---------------------------------------------|
| `/auth`         | Login, user session                        |
| `/teachers`     | Instructor list and profiles                |
| `/excel`        | Uploading and parsing load spreadsheets     |
| `/docx`         | Uploading and scanning DOCX templates       |
| `/settings`     | Column mapping, generation settings         |
| `/blocks`       | Handling repeating template blocks (loops)  |
| `/generate`     | Generating IPP documents per instructor      |
| `/raw-template` | Parsing a template without a saved mapping  |
| `/manual-fill`  | Manual editing of plan cells                |
| `/form63`       | Form 63 generation                          |
| `/form64`       | Form 64 generation                          |
| `/history`      | History and download of generated files     |
| `/analysis`     | Load analytics                              |

Full request/response schemas are available in the Swagger UI (`/docs`) once the backend is running.

## Git workflow

### Branch naming

- `feature/<short-topic>` — new functionality (`feature/file-upload`)
- `fix/<short-topic>` — bug fix (`fix/docx-parser-bug`)
- `refactor/<short-topic>` — refactor with no behavior change (`refactor/db-connection`)
- `chore/<short-topic>` — chores: dependencies, config, scripts (`chore/add-env-template`)
- `docs/<short-topic>` — documentation (`docs/update-readme`)

Rules: Latin characters only, lowercase, words separated by `-`, one branch per logical task.

### Commit message format (Conventional Commits)

```
<type>(<scope>): <short summary>
```

- `<type>` — type of change (see allowed types below)
- `<scope>` — area affected (`backend`, `frontend`, `db`, `docs`, `ci`, etc.)
- `<short summary>` — imperative, concise description

Allowed types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`, `style`.

### Pull requests

Every PR should have a clear title (like a commit summary), a short description, and a screenshot or example request if it changes UI or API behavior.

PR description template:

- **What:** what was done
- **Why:** why it was done
- **How to test:** how to verify it
