import shutil
import uuid
from pathlib import Path
from fastapi import UploadFile, HTTPException


def save_upload_file(upload_file: UploadFile, target_dir: Path, allowed_exts: set[str]) -> str:
    if not upload_file.filename:
        raise HTTPException(status_code=400, detail="Файл без имени")

    ext = Path(upload_file.filename).suffix.lower()
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"Недопустимое расширение {ext}")

    file_id = uuid.uuid4().hex
    out_path = (target_dir / f"{file_id}{ext}").resolve()

    if target_dir.resolve() not in out_path.parents:
        raise HTTPException(status_code=400, detail="Недопустимый путь сохранения")

    upload_file.file.seek(0)
    with open(out_path, "wb") as f:
        shutil.copyfileobj(upload_file.file, f)

    return str(out_path)


def safe_resolve_in_dir(path_str: str, base_dir: Path) -> Path:
    p = Path(path_str).expanduser().resolve()
    base = base_dir.resolve()
    if base not in p.parents and p != base:
        raise HTTPException(status_code=400, detail="Недопустимый путь")
    return p
