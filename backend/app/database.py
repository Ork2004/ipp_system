import os
from pathlib import Path

import psycopg2
import psycopg2.pool
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BASE_DIR / ".env"

load_dotenv(ENV_PATH, encoding="utf-8")


def get_db_config() -> dict:
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": os.getenv("DB_PORT", "5432"),
        "database": os.getenv("DB_NAME", "ipp"),
        "user": os.getenv("DB_USER", "postgres"),
        "password": os.getenv("DB_PASSWORD", "postgres"),
    }


_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        _pool = psycopg2.pool.ThreadedConnectionPool(
            int(os.getenv("DB_POOL_MIN", "1")),
            int(os.getenv("DB_POOL_MAX", "10")),
            **get_db_config(),
        )
    return _pool


class PooledConnection:
    """Proxy around a connection borrowed from the pool.

    Every call site in this codebase does `conn = get_connection()` and
    releases it with `conn.close()`. Rather than touch every call site,
    `close()` here returns the connection to the pool instead of
    terminating it, so the rest of the code stays unchanged.
    """

    def __init__(self, conn, pool: psycopg2.pool.ThreadedConnectionPool):
        self._conn = conn
        self._pool = pool
        self._released = False

    def close(self):
        if not self._released:
            self._released = True
            self._pool.putconn(self._conn)

    def __enter__(self):
        self._conn.__enter__()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return self._conn.__exit__(exc_type, exc_val, exc_tb)

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def __del__(self):
        # Safety net so a forgotten close() doesn't leak the connection
        # out of the pool forever.
        try:
            self.close()
        except Exception:
            pass


def get_connection() -> PooledConnection:
    pool = _get_pool()
    conn = pool.getconn()
    return PooledConnection(conn, pool)


def close_pool():
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None
