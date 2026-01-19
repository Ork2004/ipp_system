import json
import re
from typing import List, Tuple, Dict, Any

import pandas as pd

from backend.app.database import get_connection


TRANSLIT_MAP = {
    "а": "a", "ә": "a", "б": "b", "в": "v", "г": "g", "ғ": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "i", "к": "k", "қ": "k", "л": "l", "м": "m", "н": "n",
    "ң": "n", "о": "o", "ө": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ұ": "u",
    "ү": "u", "ф": "f", "х": "h", "һ": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sh",
    "ъ": "", "ы": "y", "і": "i", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def slugify_cyr_to_lat(s: str) -> str:
    s = (s or "").strip().lower()
    out = []
    for ch in s:
        if ch.isalnum():
            out.append(TRANSLIT_MAP.get(ch, ch))
        else:
            out.append("_")
    key = "".join(out)
    key = re.sub(r"_+", "_", key).strip("_")
    if not key:
        key = "col"
    if key[0].isdigit():
        key = f"c_{key}"
    return key


def _find_header_row(df: pd.DataFrame) -> int:
    for idx, row in df.iterrows():
        if row.notna().any():
            return idx
    raise Exception("Не найдена строка заголовков")


def _extract_headers(df: pd.DataFrame, header_row_index: int) -> List[Tuple[int, str]]:
    headers: List[Tuple[int, str]] = []
    for col_index, value in enumerate(df.iloc[header_row_index]):
        if pd.isna(value):
            continue
        header_text = str(value).strip()
        if header_text:
            headers.append((col_index, header_text))
    if not headers:
        raise Exception("Заголовки пустые или не найдены")
    return headers


def parse_excel(file_path: str, department_id: int, academic_year: str, source_filename: str | None = None) -> int:
    df = pd.read_excel(file_path, header=None)
    header_row_index = _find_header_row(df)
    headers = _extract_headers(df, header_row_index)

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE excel_templates
                    SET is_active = FALSE
                    WHERE department_id = %s AND academic_year = %s AND is_active = TRUE;
                """, (department_id, academic_year))

                cur.execute("""
                    INSERT INTO excel_templates (
                        department_id, academic_year, file_path, source_filename,
                        column_schema, is_active, status, error_text
                    )
                    VALUES (%s,%s,%s,%s,%s,TRUE,'parsed',NULL)
                    RETURNING id;
                """, (
                    department_id, academic_year, file_path, source_filename,
                    json.dumps(headers, ensure_ascii=False)
                ))
                template_id = cur.fetchone()[0]

                used_keys: Dict[str, int] = {}

                for pos, (_, header_text) in enumerate(headers):
                    base_key = slugify_cyr_to_lat(header_text)
                    col_key = base_key

                    if base_key in used_keys:
                        used_keys[base_key] += 1
                        col_key = f"{base_key}_{used_keys[base_key]}"
                    else:
                        used_keys[base_key] = 1

                    cur.execute("""
                        INSERT INTO excel_columns (template_id, column_name, header_text, position_index)
                        VALUES (%s,%s,%s,%s);
                    """, (template_id, col_key, header_text, pos))

                excel_rows_start = header_row_index + 1
                row_number = 1

                for idx in range(excel_rows_start, len(df)):
                    row = df.iloc[idx]
                    if row.isna().all():
                        break

                    row_dict: Dict[str, Any] = {}
                    for col_index, header_text in headers:
                        value = row[col_index]
                        row_dict[header_text] = None if pd.isna(value) else value

                    cur.execute("""
                        INSERT INTO excel_rows (template_id, teacher_id, row_number, row_data)
                        VALUES (%s, NULL, %s, %s);
                    """, (template_id, row_number, json.dumps(row_dict, ensure_ascii=False)))

                    row_number += 1

        return template_id
    finally:
        conn.close()
