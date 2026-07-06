"""Column-position mapping for teaching-load DOCX tables.

Centralizes the "which DOCX table column holds which field" logic that used to
live inline in ``generator.py`` (``_guess_column_map`` / ``SUMMARY_TABLE_COLUMN_MAP``),
so it can be reused both as the generation-time fallback and as the admin-facing
auto-suggest function behind ``/settings/table-column-map/suggest``.
"""

from typing import Any, Callable, Dict, List, Optional, Tuple

from backend.app.utils.manual_prefill import (
    _build_loop_column_index_map as _build_column_index_correspondence,
    _column_hints_overlap_score as column_hints_overlap_score,
)
from backend.app.utils.teaching_load import (
    _resolve_columns as resolve_excel_columns,
    detect_semester_columns,
    get_performance_summary_binding,
    get_teaching_load_binding,
    get_teaching_load_summary_binding,
    is_excel_source_binding,
    is_manual_source_binding,
)

TEACHING_LOAD_ROLE_LABELS = {
    "teaching_load.staff": "Штатная нагрузка",
    "teaching_load.hourly": "Почасовая нагрузка",
    "teaching_load.summary": "Сводная таблица нагрузки",
}

# Below this overlap between this year's and last year's column_hints, the
# previous table is considered too different to trust for carry-forward -
# suggest_column_map()'s plain keyword guess is used instead.
CARRY_FORWARD_MIN_OVERLAP = 0.5

# Fixed column layout of the "teaching_load_summary" table today - used verbatim
# as the generation-time fallback when no persisted/heuristic mapping applies,
# and as the last-resort fallback for the heuristic summary suggester below.
SUMMARY_TABLE_COLUMN_MAP: Dict[str, int] = {
    "l": 1,
    "spz": 2,
    "lz": 3,
    "srsp": 4,
    "rk_1_2": 5,
    "ekzameny": 6,
    "class_hours": 7,
    "practika": 8,
    "research_work": 9,
    "diploma_supervision": 10,
    "other_work": 11,
    "office_hours": 12,
    "itogo": 13,
}

# Ordered field/predicate rules for the two "detail" teaching-load tables
# (staff/hourly). Order matters: for each column hint, the FIRST matching rule
# wins for that hint, and later hints can still overwrite an earlier field
# assignment (this mirrors the original if/elif chain semantics).
#
# Fixed vs. the original inline version: "practika" ("Практика (все виды)")
# was never reachable before, because "практ" (spz's rule) is a substring of
# "практика" and was checked first, so a practice/internship column always
# got misclassified as spz and overwrote the real spz column - confirmed via
# a byte-for-byte comparison against files/Шаблон.docx while porting this
# code (real table there has both a "Практические, кол-во часов" column,
# meant for spz, and a separate "Практика (все виды)" column, meant for
# practika - the old code always mapped spz to the latter and never filled
# practika at all). Excluding "практика" from the spz predicate fixes both
# fields; this is a deliberate, intentional behavior change on top of the
# otherwise-faithful port (everything else here matches the previous
# generator.py::_guess_column_map verbatim, verified identical for all 12
# tables of the real template before this one exclusion was added).
TEACHING_LOAD_FIELD_RULES: List[Tuple[str, Callable[[str], bool]]] = [
    ("discipline", lambda hint: "наименование" in hint or "subject" in hint or "пән" in hint),
    ("op", lambda hint: "образовательная программа" in hint or hint == "оп" or "program" in hint),
    ("group", lambda hint: "группа" in hint or "group" in hint),
    ("academic_period", lambda hint: "академ" in hint or "period" in hint),
    ("course", lambda hint: "курс" in hint or hint == "course"),
    ("credits", lambda hint: "кредит" in hint),
    ("student_count", lambda hint: "обуча" in hint or "контингент" in hint or "students" in hint),
    ("l", lambda hint: "лек" in hint),
    ("spz", lambda hint: "практ" in hint and "практика" not in hint),
    ("lz", lambda hint: "лабор" in hint),
    ("srsp", lambda hint: "срсп" in hint or "сроп" in hint),
    ("rk_1_2", lambda hint: "рубеж" in hint),
    ("ekzameny", lambda hint: "экзам" in hint),
    ("practika", lambda hint: "практика" in hint),
    ("diploma_supervision", lambda hint: "рук-во дп" in hint or "дп и мд" in hint or "диссертац" in hint),
    ("research_work", lambda hint: "нирм" in hint or "нирд" in hint),
    ("other_work", lambda hint: "двр" in hint or "другой" in hint or "дополнительн" in hint),
    ("itogo", lambda hint: "итого" in hint and "час" in hint),
]

# Applied after the rules above, only for fields still unresolved - exact port
# of _guess_column_map's fallback_indexes.
TEACHING_LOAD_FALLBACK_INDEXES: Dict[str, int] = {
    "discipline": 1,
    "group": 2,
}

# Heuristic aliases for the summary table, used only by the admin-facing
# suggester (suggest_column_map_with_confidence), never by the plain
# suggest_column_map() generation-time fallback - so generation behavior for
# rows with no persisted mapping is unaffected by this addition.
SUMMARY_TABLE_FIELD_RULES: List[Tuple[str, Callable[[str], bool]]] = [
    ("l", lambda hint: "лек" in hint),
    ("spz", lambda hint: "практ" in hint and "практика" not in hint),
    ("lz", lambda hint: "лабор" in hint),
    ("srsp", lambda hint: "срсп" in hint or "сроп" in hint),
    ("rk_1_2", lambda hint: "рубеж" in hint),
    ("ekzameny", lambda hint: "экзам" in hint),
    ("class_hours", lambda hint: "всего аудитор" in hint or ("class" in hint and "hour" in hint)),
    ("practika", lambda hint: "практика" in hint),
    ("research_work", lambda hint: "нирм" in hint or "нирд" in hint),
    ("diploma_supervision", lambda hint: "рук-во дп" in hint or "дп и мд" in hint or "диссертац" in hint),
    ("other_work", lambda hint: "двр" in hint or "другой" in hint or "дополнительн" in hint),
    ("office_hours", lambda hint: "всего внеаудитор" in hint or ("office" in hint and "hour" in hint)),
    ("itogo", lambda hint: "итого" in hint),
]


def _hints_lower(raw_table: Dict[str, Any]) -> List[str]:
    return [str(value).strip().lower() for value in (raw_table.get("column_hints") or [])]


def suggest_column_map(raw_table: Dict[str, Any], *, kind: str = "detail") -> Dict[str, int]:
    """Best-effort {field_key: col_index} guess from a raw table's column_hints.

    This is the generation-time fallback used when no persisted mapping exists
    for a bound table - it must stay behaviorally identical to the previous
    inline implementations (_guess_column_map / SUMMARY_TABLE_COLUMN_MAP) so
    existing generation_settings rows keep producing the same output.
    """
    if kind == "summary":
        return dict(SUMMARY_TABLE_COLUMN_MAP)

    hints = _hints_lower(raw_table)
    out: Dict[str, int] = {}

    for idx, hint in enumerate(hints):
        for field_key, predicate in TEACHING_LOAD_FIELD_RULES:
            if predicate(hint):
                out[field_key] = idx
                break

    for field_key, fallback_index in TEACHING_LOAD_FALLBACK_INDEXES.items():
        if field_key in out:
            continue
        if len(hints) > fallback_index:
            out[field_key] = fallback_index

    return out


def suggest_column_map_with_confidence(raw_table: Dict[str, Any], *, kind: str = "detail") -> Dict[str, Dict[str, Any]]:
    """Richer variant for the admin-facing suggest endpoint: for every field,
    reports the guessed col_index plus how confident the guess is, so the
    Settings UI can show it for review instead of applying it silently.

    confidence values: "matched" (keyword hint matched), "fallback" (guessed by
    position only), "unmapped" (no guess at all).
    """
    hints = _hints_lower(raw_table)
    result: Dict[str, Dict[str, Any]] = {}

    if kind == "summary":
        rules = SUMMARY_TABLE_FIELD_RULES
        matched: Dict[str, int] = {}
        for idx, hint in enumerate(hints):
            for field_key, predicate in rules:
                if predicate(hint):
                    matched[field_key] = idx
                    break

        for field_key, fallback_index in SUMMARY_TABLE_COLUMN_MAP.items():
            if field_key in matched:
                result[field_key] = {
                    "col_index": matched[field_key],
                    "confidence": "matched",
                    "hint_text": hints[matched[field_key]] if matched[field_key] < len(hints) else "",
                }
            elif len(hints) > fallback_index:
                result[field_key] = {
                    "col_index": fallback_index,
                    "confidence": "fallback",
                    "hint_text": hints[fallback_index],
                }
            else:
                result[field_key] = {"col_index": None, "confidence": "unmapped", "hint_text": ""}
        return result

    matched_detail: Dict[str, int] = {}
    for idx, hint in enumerate(hints):
        for field_key, predicate in TEACHING_LOAD_FIELD_RULES:
            if predicate(hint):
                matched_detail[field_key] = idx
                break

    all_field_keys = [field_key for field_key, _ in TEACHING_LOAD_FIELD_RULES]
    for field_key in all_field_keys:
        if field_key in matched_detail:
            idx = matched_detail[field_key]
            result[field_key] = {"col_index": idx, "confidence": "matched", "hint_text": hints[idx]}
        elif field_key in TEACHING_LOAD_FALLBACK_INDEXES and len(hints) > TEACHING_LOAD_FALLBACK_INDEXES[field_key]:
            idx = TEACHING_LOAD_FALLBACK_INDEXES[field_key]
            result[field_key] = {"col_index": idx, "confidence": "fallback", "hint_text": hints[idx]}
        else:
            result[field_key] = {"col_index": None, "confidence": "unmapped", "hint_text": ""}

    return result


def carry_forward_column_map(
    current_raw_table: Dict[str, Any],
    prev_map_entry: Dict[str, Any],
    prev_raw_table: Dict[str, Any],
) -> Optional[Dict[str, int]]:
    """Re-project a previous year's confirmed {field_key: col_index} map onto
    this year's table, using the same column-hint fuzzy-matching machinery
    already used for manual-fill carryover (backend/app/utils/manual_prefill.py).

    Returns None if the previous table's structure is too dissimilar to trust
    (caller should fall back to suggest_column_map in that case). Fields whose
    previous column no longer has a confident match in the current table
    (e.g. a column was removed this year) are simply dropped, not guessed at -
    that keeps a partial, reviewable result rather than a wrong one.
    """
    current_hints = current_raw_table.get("column_hints") or []
    prev_hints = prev_raw_table.get("column_hints") or []

    if column_hints_overlap_score(current_hints, prev_hints) < CARRY_FORWARD_MIN_OVERLAP:
        return None

    current_to_prev = _build_column_index_correspondence(
        current_hints,
        prev_hints,
        current_raw_table.get("stable_column_keys"),
        prev_raw_table.get("stable_column_keys"),
    )
    prev_to_current = {prev_idx: cur_idx for cur_idx, prev_idx in current_to_prev.items()}

    prev_map = prev_map_entry.get("map") or {}
    new_map: Dict[str, int] = {}
    for field_key, prev_col_index in prev_map.items():
        cur_col_index = prev_to_current.get(int(prev_col_index))
        if cur_col_index is not None:
            new_map[field_key] = cur_col_index

    return new_map or None


def _issue(code: str, message_ru: str, role: Optional[str] = None) -> Dict[str, Any]:
    return {"code": code, "message_ru": message_ru, "role": role}


def validate_generation_readiness(
    *,
    settings_cfg: Dict[str, Any],
    excel_columns: List[Tuple[str, str]],
    raw_tables: Dict[int, Dict[str, Any]],
) -> Dict[str, Any]:
    """Pre-generation sanity check, surfaced by /settings/validate so an admin
    sees exactly what is missing/unconfirmed before generating a document,
    instead of a raw exception (or a silently blank field) during generation.
    Never raises - always returns a report.
    """
    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    resolved_excel_columns = resolve_excel_columns(excel_columns, settings_cfg)
    if not resolved_excel_columns.get("teacher_col"):
        errors.append(_issue(
            "missing_teacher_col",
            "В Excel не найдена колонка с ФИО преподавателя - укажите её на вкладке «Колонки».",
        ))
    if not resolved_excel_columns.get("staff_hours_col"):
        errors.append(_issue(
            "missing_staff_hours_col",
            "В Excel не найдена колонка со штатными часами - укажите её на вкладке «Колонки».",
        ))

    if not detect_semester_columns(excel_columns):
        errors.append(_issue(
            "no_semester_columns",
            "В Excel не найдены колонки семестров (например «1 семестр», «2 семестр»).",
        ))

    table_column_maps = (settings_cfg or {}).get("table_column_maps") or {}

    def _check_teaching_load_role(role: str, binding: Dict[str, Any], kind: str) -> None:
        label = TEACHING_LOAD_ROLE_LABELS[role]

        if is_manual_source_binding(binding):
            warnings.append(_issue(
                "manual_source", f"Таблица «{label}» заполняется вручную, не через Excel.", role,
            ))
            return

        raw_table_id = binding.get("raw_table_id")
        if not raw_table_id or int(raw_table_id) not in raw_tables:
            errors.append(_issue(
                "unbound_table", f"Таблица «{label}» не привязана ни к одной таблице шаблона.", role,
            ))
            return

        raw_table = raw_tables[int(raw_table_id)]
        entry = table_column_maps.get(role)
        has_persisted_map = bool(entry and int(entry.get("raw_table_id") or -1) == int(raw_table_id) and entry.get("map"))

        if not has_persisted_map:
            warnings.append(_issue(
                "unconfirmed_mapping",
                f"Колонки для таблицы «{label}» не подтверждены - используется автоматическое "
                f"определение, проверьте результат после генерации.",
                role,
            ))
            confidence = suggest_column_map_with_confidence(raw_table, kind=kind)
            if kind == "detail" and confidence.get("discipline", {}).get("confidence") == "unmapped":
                errors.append(_issue(
                    "discipline_column_unmapped",
                    f"В таблице «{label}» не удалось определить колонку «Дисциплина» - "
                    f"эта таблица не заполнится.",
                    role,
                ))

    for load_kind in ("staff", "hourly"):
        _check_teaching_load_role(
            f"teaching_load.{load_kind}", get_teaching_load_binding(settings_cfg, load_kind), "detail",
        )
    _check_teaching_load_role("teaching_load.summary", get_teaching_load_summary_binding(settings_cfg), "summary")

    perf_binding = get_performance_summary_binding(settings_cfg)
    if not perf_binding.get("raw_table_id"):
        warnings.append(_issue(
            "unbound_performance_summary",
            "Таблица «Итоги выполнения ИП» не привязана - она останется пустой.",
            "performance_summary",
        ))

    return {"ready": len(errors) == 0, "errors": errors, "warnings": warnings}
