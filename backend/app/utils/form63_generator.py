from pathlib import Path

from openpyxl import Workbook, load_workbook


def build_form63_rows_from_preview(items: list[dict]) -> list[dict]:
    rows = []

    for item in items:
        rows.append({
            "teacher_name": item["teacher_name"],
            "position": item["position"],
            "semester": item["semester"],
            "teaching_auditory_hours": item["teaching_auditory_hours"],
            "teaching_extraauditory_hours": item["teaching_extraauditory_hours"],
            "methodical_hours": item["methodical_hours"],
            "research_hours": item["research_hours"],
            "organizational_methodical_hours": item["organizational_methodical_hours"],
            "educational_hours": item["educational_hours"],
            "qualification_hours": item["qualification_hours"],
            "social_hours": item["social_hours"],
            "planned_total_hours": item["planned_total_hours"],
            "hourly_auditory_hours": item["hourly_auditory_hours"],
        })

    return rows


def export_form63_simple_xlsx(rows: list[dict], output_path: str):
    wb = Workbook()
    ws = wb.active
    ws.title = "Form63"

    headers = [
        "ФИО ППС",
        "Должность",
        "Семестр",
        "Учебная работа (аудиторная)",
        "Учебная работа (внеаудиторная)",
        "Учебно-методическая работа",
        "Научная работа",
        "Организационно-методическая работа",
        "Воспитательная работа",
        "Повышение квалификации",
        "Общественная работа",
        "Итого плановых часов",
        "Почасовая аудиторная работа",
    ]

    ws.append(headers)

    for row in rows:
        ws.append([
            row["teacher_name"],
            row["position"],
            row["semester"],
            row["teaching_auditory_hours"],
            row["teaching_extraauditory_hours"],
            row["methodical_hours"],
            row["research_hours"],
            row["organizational_methodical_hours"],
            row["educational_hours"],
            row["qualification_hours"],
            row["social_hours"],
            row["planned_total_hours"],
            row["hourly_auditory_hours"],
        ])

    widths = {
        "A": 35,
        "B": 25,
        "C": 10,
        "D": 22,
        "E": 24,
        "F": 24,
        "G": 18,
        "H": 28,
        "I": 20,
        "J": 22,
        "K": 18,
        "L": 18,
        "M": 22,
    }
    for col, width in widths.items():
        ws.column_dimensions[col].width = width

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    wb.save(output_path)


def export_form63_from_template(rows: list[dict], template_path: str, output_path: str):
    wb = load_workbook(template_path)
    ws = wb.active

    # Разъединяем merged cells только в области данных, шапку не трогаем
    ranges_to_unmerge = []
    for merged_range in ws.merged_cells.ranges:
        if merged_range.min_row >= 16:
            ranges_to_unmerge.append(str(merged_range))

    for rng in ranges_to_unmerge:
        ws.unmerge_cells(rng)

    grouped = {}
    for row in rows:
        key = (row["teacher_name"], row["position"])
        if key not in grouped:
            grouped[key] = {
                "teacher_name": row["teacher_name"],
                "position": row["position"],
                "sem1": None,
                "sem2": None,
            }

        if row["semester"] == 1:
            grouped[key]["sem1"] = row
        elif row["semester"] == 2:
            grouped[key]["sem2"] = row

    start_row = 16
    current_row = start_row
    no = 1

    for _, teacher in grouped.items():
        sem1 = teacher["sem1"] or {
            "semester": 1,
            "teaching_auditory_hours": 0,
            "teaching_extraauditory_hours": 0,
            "methodical_hours": 0,
            "research_hours": 0,
            "organizational_methodical_hours": 0,
            "educational_hours": 0,
            "qualification_hours": 0,
            "social_hours": 0,
            "planned_total_hours": 0,
            "hourly_auditory_hours": 0,
        }

        sem2 = teacher["sem2"] or {
            "semester": 2,
            "teaching_auditory_hours": 0,
            "teaching_extraauditory_hours": 0,
            "methodical_hours": 0,
            "research_hours": 0,
            "organizational_methodical_hours": 0,
            "educational_hours": 0,
            "qualification_hours": 0,
            "social_hours": 0,
            "planned_total_hours": 0,
            "hourly_auditory_hours": 0,
        }

        # 1 семестр
        ws[f"C{current_row}"] = no
        ws[f"D{current_row}"] = teacher["teacher_name"]
        ws[f"G{current_row}"] = teacher["position"]
        ws[f"J{current_row}"] = 1
        ws[f"K{current_row}"] = sem1["teaching_auditory_hours"]
        ws[f"L{current_row}"] = sem1["teaching_extraauditory_hours"]
        ws[f"M{current_row}"] = sem1["methodical_hours"]
        ws[f"N{current_row}"] = sem1["research_hours"]
        ws[f"O{current_row}"] = sem1["organizational_methodical_hours"]
        ws[f"P{current_row}"] = sem1["educational_hours"]
        ws[f"Q{current_row}"] = sem1["qualification_hours"]
        ws[f"R{current_row}"] = sem1["social_hours"]
        ws[f"S{current_row}"] = sem1["planned_total_hours"]
        ws[f"T{current_row}"] = sem1["hourly_auditory_hours"]
        ws[f"U{current_row}"] = 0

        # 2 семестр
        ws[f"C{current_row + 1}"] = no
        ws[f"D{current_row + 1}"] = teacher["teacher_name"]
        ws[f"G{current_row + 1}"] = teacher["position"]
        ws[f"J{current_row + 1}"] = 2
        ws[f"K{current_row + 1}"] = sem2["teaching_auditory_hours"]
        ws[f"L{current_row + 1}"] = sem2["teaching_extraauditory_hours"]
        ws[f"M{current_row + 1}"] = sem2["methodical_hours"]
        ws[f"N{current_row + 1}"] = sem2["research_hours"]
        ws[f"O{current_row + 1}"] = sem2["organizational_methodical_hours"]
        ws[f"P{current_row + 1}"] = sem2["educational_hours"]
        ws[f"Q{current_row + 1}"] = sem2["qualification_hours"]
        ws[f"R{current_row + 1}"] = sem2["social_hours"]
        ws[f"S{current_row + 1}"] = sem2["planned_total_hours"]
        ws[f"T{current_row + 1}"] = sem2["hourly_auditory_hours"]
        ws[f"U{current_row + 1}"] = 0

        current_row += 2
        no += 1

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    wb.save(output_path)