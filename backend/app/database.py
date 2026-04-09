import os
import psycopg2

from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BASE_DIR / ".env"

load_dotenv(encoding="utf-8")

def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        database=os.getenv("DB_NAME", "ipp_system"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "postgres"),
    )
