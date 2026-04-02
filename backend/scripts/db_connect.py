"""
Shared DB connection helper for SPECTRA Python scripts.
Mirrors the logic in frontend/src/lib/db.server.ts:
  - Windows Auth when DB_USER is not set (Trusted_Connection=yes)
  - SQL Auth when DB_USER is set
Env loaded from root .env if it exists, otherwise frontend/.env.local.
"""
import os
import pyodbc
from pathlib import Path
from dotenv import load_dotenv

_SCRIPTS_DIR  = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPTS_DIR.parent

# Load credentials: prefer root .env, then frontend app env files.
_env_candidates = [
    _PROJECT_ROOT / ".env",
    _PROJECT_ROOT / "frontend" / ".env.local",
    _PROJECT_ROOT / "spectra-app" / ".env.local",
]
for _p in _env_candidates:
    if _p.exists():
        load_dotenv(_p)
        break

_DB_SERVER = os.getenv("DB_SERVER", "localhost")
_DB_NAME   = os.getenv("DB_NAME",   "SPECTRA")
_DB_USER   = (os.getenv("DB_USER") or "").strip()
_DB_PASS   = (os.getenv("DB_PASSWORD") or "").strip()
_DB_DRIVER = os.getenv("DB_ODBC_DRIVER", "ODBC Driver 18 for SQL Server")


def get_conn() -> pyodbc.Connection:
    """Return a pyodbc connection using Windows Auth or SQL Auth."""
    if _DB_USER:
        cs = (
            f"DRIVER={{{_DB_DRIVER}}};"
            f"SERVER={_DB_SERVER};DATABASE={_DB_NAME};"
            f"UID={_DB_USER};PWD={_DB_PASS};"
            "TrustServerCertificate=yes;Encrypt=no;"
        )
    else:
        cs = (
            f"DRIVER={{{_DB_DRIVER}}};"
            f"SERVER={_DB_SERVER};DATABASE={_DB_NAME};"
            "Trusted_Connection=yes;"
            "TrustServerCertificate=yes;Encrypt=no;"
        )
    return pyodbc.connect(cs)
