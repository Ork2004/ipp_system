from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from passlib.context import CryptContext

from backend.app.database import get_connection
import os

router = APIRouter(prefix="/auth", tags=["Auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

JWT_SECRET = os.getenv("JWT_SECRET", "change_me_super_secret")
JWT_ALG = os.getenv("JWT_ALG", "HS256")
JWT_EXPIRE_MIN = int(os.getenv("JWT_EXPIRE_MIN", "43200"))


def create_access_token(data: dict, expires_minutes: int = JWT_EXPIRE_MIN) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=expires_minutes)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    return pwd_context.verify(plain, hashed)


def get_password_hash(plain: str) -> str:
    return pwd_context.hash(plain)


@router.post("/login")
def login(payload: Dict[str, Any]):
    username = payload.get("username")
    password = payload.get("password")
    if not username or not password:
        raise HTTPException(status_code=400, detail="username и password обязательны")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, username, password_hash, role, department_id, teacher_id, is_active
                FROM users
                WHERE username=%s OR email=%s
                LIMIT 1;
            """, (username, username))
            u = cur.fetchone()

        if not u:
            raise HTTPException(status_code=401, detail="Неверный логин или пароль")

        user_id, uname, pw_hash, role, department_id, teacher_id, is_active = u
        if not is_active:
            raise HTTPException(status_code=403, detail="Аккаунт отключен")

        if role != "guest":
            if not verify_password(password, pw_hash):
                raise HTTPException(status_code=401, detail="Неверный логин или пароль")
        else:
            if pw_hash and not verify_password(password, pw_hash):
                raise HTTPException(status_code=401, detail="Неверный логин или пароль")

        token = create_access_token({
            "sub": str(user_id),
            "role": role,
            "department_id": department_id,
            "teacher_id": teacher_id,
            "username": uname,
        })

        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "username": uname,
                "role": role,
                "department_id": department_id,
                "teacher_id": teacher_id,
            }
        }
    finally:
        conn.close()


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_roles(*roles: str):
    def _guard(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        return user
    return _guard


@router.get("/me")
def me(user=Depends(get_current_user)):
    return {
        "id": int(user["sub"]),
        "username": user.get("username"),
        "role": user.get("role"),
        "department_id": user.get("department_id"),
        "teacher_id": user.get("teacher_id"),
    }


@router.post("/admin/create-user")
def admin_create_user(payload: Dict[str, Any], admin=Depends(require_roles("admin"))):
    username = payload.get("username")
    password = payload.get("password")
    role = payload.get("role")
    department_id = payload.get("department_id")
    teacher_id = payload.get("teacher_id")

    if not username or not role:
        raise HTTPException(status_code=400, detail="username и role обязательны")
    if role in ("admin", "teacher") and not password:
        raise HTTPException(status_code=400, detail="password обязателен для admin/teacher")
    if role not in ("admin", "teacher", "guest"):
        raise HTTPException(status_code=400, detail="role должен быть admin|teacher|guest")

    pw_hash = get_password_hash(password) if password else None

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO users(username, password_hash, role, department_id, teacher_id)
                    VALUES (%s,%s,%s,%s,%s)
                    RETURNING id;
                """, (username, pw_hash, role, department_id, teacher_id))
                new_id = cur.fetchone()[0]
        return {"status": "ok", "user_id": new_id}
    finally:
        conn.close()
