import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

export default function SettingsPage() {
  const navigate = useNavigate();

  const [departmentId, setDepartmentId] = useState(
    Number(localStorage.getItem("department_id") || 0)
  );
  const [excelTemplates, setExcelTemplates] = useState([]);
  const [academicYear, setAcademicYear] = useState(
    localStorage.getItem("academic_year") || "2025-2026"
  );
  const [excelTemplateId, setExcelTemplateId] = useState("");

  const [cols, setCols] = useState([]);
  const [settingsStatus, setSettingsStatus] = useState("");

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [blocksData, setBlocksData] = useState({ blocks: [], semester_map: {} });
  const [blocksStatus, setBlocksStatus] = useState("");
  const [rawTemplateInfo, setRawTemplateInfo] = useState(null);

  const [cfg, setCfg] = useState({
    columns: {
      teacher_col: "",
      staff_hours_col: "",
      hourly_hours_col: "",
      discipline_col: "",
      activity_type_col: "",
      group_col: "",
      op_col: "",
    },
    activity_types: {
      lecture: ["лек", "лк", "lecture"],
      lab_practice: ["лаб", "пра", "lab", "pract"],
    },
    merge_rules: {
      key_cols: ["distsiplina", "op"],
      group_join: ", ",
      group_priority_type: "lecture",
      sum_cols_by_type: {
        lecture: ["l", "srsp", "ekzameny"],
        lab_practice: ["spz", "lz", "rk_1_2"],
      },
    },
  });

  const years = useMemo(() => {
    const set = new Set(
      (excelTemplates || []).map((t) => t.academic_year).filter(Boolean)
    );
    set.add(academicYear);
    return Array.from(set).sort().reverse();
  }, [excelTemplates, academicYear]);

  const excelForYear = useMemo(() => {
    return (
      (excelTemplates || []).find(
        (t) => String(t.academic_year) === String(academicYear)
      ) || null
    );
  }, [excelTemplates, academicYear]);

  const colOptions = useMemo(
    () => (cols || []).map((c) => c.column_name),
    [cols]
  );

  function setCol(key, value) {
    setCfg((prev) => ({
      ...prev,
      columns: { ...prev.columns, [key]: value },
    }));
  }

  function setActivityPatterns(typeKey, text) {
    const arr = String(text || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setCfg((prev) => ({
      ...prev,
      activity_types: {
        ...(prev.activity_types || {}),
        [typeKey]: arr,
      },
    }));
  }

  function setMergeRule(key, value) {
    setCfg((prev) => ({
      ...prev,
      merge_rules: { ...(prev.merge_rules || {}), [key]: value },
    }));
  }

  function setMergeRuleArray(key, arr) {
    setCfg((prev) => ({
      ...prev,
      merge_rules: { ...(prev.merge_rules || {}), [key]: arr },
    }));
  }

  function setSumColsByType(typeKey, arr) {
    setCfg((prev) => ({
      ...prev,
      merge_rules: {
        ...(prev.merge_rules || {}),
        sum_cols_by_type: {
          ...((prev.merge_rules || {}).sum_cols_by_type || {}),
          [typeKey]: arr,
        },
      },
    }));
  }

  async function loadExcelTemplates(depId = departmentId) {
    if (!depId) {
      setSettingsStatus("Нет department_id. Выйди и зайди заново.");
      return;
    }
    try {
      const res = await api.get("/excel/templates", {
        params: { department_id: depId },
      });
      setExcelTemplates(res.data || []);
    } catch (e) {
      console.error(e);
      setSettingsStatus(e?.response?.data?.detail || "Ошибка загрузки Excel");
    }
  }

  async function loadColumns(exId) {
    if (!exId) return;
    try {
      const res = await api.get(`/excel/${exId}/columns`);
      setCols(res.data || []);
    } catch (e) {
      console.error(e);
      setSettingsStatus("Ошибка загрузки колонок");
    }
  }

  async function loadCurrentSettingsByYear(depId, year) {
    if (!depId || !year) return;
    try {
      const res = await api.get("/settings/current", {
        params: { department_id: depId, academic_year: year },
      });

      if (res.data?.exists) {
        const loaded = res.data.config || {};
        const c = loaded.columns || {};
        const at = loaded.activity_types || {};
        const mr = loaded.merge_rules || {};
        const sct = mr.sum_cols_by_type || {};

        setCfg({
          columns: {
            teacher_col: c.teacher_col || "",
            staff_hours_col: c.staff_hours_col || "",
            hourly_hours_col: c.hourly_hours_col || "",
            discipline_col: c.discipline_col || "",
            activity_type_col: c.activity_type_col || "",
            group_col: c.group_col || "",
            op_col: c.op_col || "",
          },
          activity_types: {
            lecture: Array.isArray(at.lecture)
              ? at.lecture
              : ["лек", "лк", "lecture"],
            lab_practice: Array.isArray(at.lab_practice)
              ? at.lab_practice
              : ["лаб", "пра", "lab", "pract"],
          },
          merge_rules: {
            key_cols: Array.isArray(mr.key_cols)
              ? mr.key_cols
              : ["distsiplina", "op"],
            group_join: mr.group_join || ", ",
            group_priority_type: mr.group_priority_type || "lecture",
            sum_cols_by_type: {
              lecture: Array.isArray(sct.lecture)
                ? sct.lecture
                : ["l", "srsp", "ekzameny"],
              lab_practice: Array.isArray(sct.lab_practice)
                ? sct.lab_practice
                : ["spz", "lz", "rk_1_2"],
            },
          },
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadBlocks(exId) {
    if (!exId) {
      setBlocksStatus("Нет Excel для этого года");
      return;
    }
    try {
      const res = await api.get("/blocks/available", {
        params: { excel_template_id: exId },
      });
      setBlocksData(res.data || { blocks: [], semester_map: {} });
      setBlocksStatus("");
    } catch (e) {
      console.error(e);
      setBlocksStatus(e?.response?.data?.detail || "Ошибка загрузки blocks");
    }
  }

  async function loadRawTemplateInfo(depId, year) {
    if (!depId || !year) {
      setRawTemplateInfo(null);
      return;
    }

    try {
      const res = await api.get("/raw-template/by-year", {
        params: { department_id: depId, academic_year: year },
      });
      setRawTemplateInfo(res.data || null);
      if (res.data?.id) {
        localStorage.setItem("raw_template_id", String(res.data.id));
      }
    } catch (e) {
      setRawTemplateInfo(null);
    }
  }

  async function saveSettings() {
    if (!departmentId) {
      setSettingsStatus("Нет department_id. Выйди и зайди заново.");
      return;
    }
    if (!academicYear) {
      setSettingsStatus("Укажи год");
      return;
    }
    if (!excelTemplateId) {
      setSettingsStatus("Нет Excel для этого года");
      return;
    }

    const c = cfg.columns || {};
    if (!c.teacher_col || !c.staff_hours_col) {
      setSettingsStatus(
        "Обязательные: ФИО преподавателя и Штатные часы"
      );
      return;
    }
    if (!c.discipline_col || !c.activity_type_col || !c.group_col) {
      setSettingsStatus(
        "Обязательные: Дисциплина, Вид занятий, Группа"
      );
      return;
    }

    const mr = cfg.merge_rules || {};
    const sct = mr.sum_cols_by_type || {};

    if (!Array.isArray(mr.key_cols) || !mr.key_cols.length) {
      setSettingsStatus(
        "Расширенные: не задано, по каким колонкам объединять строки"
      );
      return;
    }

    const lectureArr = Array.isArray(sct.lecture) ? sct.lecture : [];
    const labArr = Array.isArray(sct.lab_practice) ? sct.lab_practice : [];

    if (!lectureArr.length && !labArr.length) {
      setSettingsStatus("Расширенные: выбери колонки для суммирования");
      return;
    }

    try {
      setSettingsStatus("Сохранение...");
      await api.post("/settings/save", {
        department_id: Number(departmentId),
        academic_year: academicYear,
        config: cfg,
      });
      setSettingsStatus("Сохранено ✅");
      await loadBlocks(excelTemplateId);
    } catch (e) {
      console.error(e);
      setSettingsStatus(e?.response?.data?.detail || "Ошибка сохранения");
    }
  }

  useEffect(() => {
    const dep = Number(localStorage.getItem("department_id") || 0);
    setDepartmentId(dep);

    const refreshAll = async () => {
      const d = Number(localStorage.getItem("department_id") || 0);
      if (!d) return;
      await loadExcelTemplates(d);
    };

    refreshAll();

    window.addEventListener("focus", refreshAll);
    const onVis = () =>
      document.visibilityState === "visible" && refreshAll();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", refreshAll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    const ex = excelForYear;
    const id = ex ? String(ex.id) : "";
    setExcelTemplateId(id);

    if (ex) {
      (async () => {
        setSettingsStatus("");
        await loadColumns(id);
        await loadBlocks(id);
        await loadCurrentSettingsByYear(departmentId, academicYear);
        await loadRawTemplateInfo(departmentId, academicYear);
      })();
    } else {
      setCols([]);
      setBlocksData({ blocks: [], semester_map: {} });
      setRawTemplateInfo(null);
      setSettingsStatus("Нет Excel для этого года");
    }
  }, [academicYear, excelTemplates]);

  return (
    <div className="container">
      <div className="page-title">Настройка генерации</div>

      <div className="card card-pad">
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <select
            className="input"
            style={{ width: 220 }}
            value={academicYear}
            onChange={(e) => {
              const y = e.target.value;
              setAcademicYear(y);
              localStorage.setItem("academic_year", y);
            }}
          >
            {years.length ? null : <option value={academicYear}>{academicYear}</option>}
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <div className="small">{settingsStatus}</div>
        </div>

        <div
          className="card"
          style={{
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(15,23,42,.10)",
            background: "#f8fbff",
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            Текущий сценарий работы
          </div>

          <div className="small" style={{ display: "grid", gap: 6 }}>
            <div>1. Загрузить Excel с нагрузкой</div>
            <div>2. Загрузить обычный DOCX шаблон</div>
            <div>3. Настроить маппинг колонок</div>
            <div>4. Заполнить ручные таблицы преподавателя</div>
            <div>5. Сгенерировать готовый ИПП</div>
          </div>
        </div>

        <div className="section-title" style={{ marginTop: 8 }}>
          Проверка данных для года {academicYear}
        </div>

        <div
          className="table-wrap"
          style={{ marginTop: 10, marginBottom: 18 }}
        >
          <table className="table">
            <thead>
              <tr>
                <th>Элемент</th>
                <th>Статус</th>
                <th>Описание</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Excel</td>
                <td style={{ fontWeight: 800 }}>
                  {excelForYear ? "Готово" : "Нет"}
                </td>
                <td>
                  {excelForYear
                    ? excelForYear.source_filename || "Файл загружен"
                    : "Сначала загрузите Excel"}
                </td>
              </tr>
              <tr>
                <td>Шаблон DOCX</td>
                <td style={{ fontWeight: 800 }}>
                  {rawTemplateInfo ? "Готово" : "Нет"}
                </td>
                <td>
                  {rawTemplateInfo
                    ? rawTemplateInfo.source_filename || "Шаблон загружен"
                    : "Сначала загрузите raw шаблон"}
                </td>
              </tr>
              <tr>
                <td>Настройки генерации</td>
                <td style={{ fontWeight: 800 }}>
                  {cfg.columns.teacher_col && cfg.columns.staff_hours_col
                    ? "Заполнены"
                    : "Не заполнены"}
                </td>
                <td>Нужно сопоставить колонки Excel с полями системы</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="hr" />

        <div className="section-title" style={{ marginTop: 14 }}>
          Обязательный маппинг колонок
        </div>

        <SelectRow
          label="ФИО преподавателя"
          value={cfg.columns.teacher_col}
          cols={cols}
          onChange={(v) => setCol("teacher_col", v)}
        />
        <SelectRow
          label="Штатные часы"
          value={cfg.columns.staff_hours_col}
          cols={cols}
          onChange={(v) => setCol("staff_hours_col", v)}
        />
        <SelectRow
          label="Почасовые часы"
          value={cfg.columns.hourly_hours_col}
          cols={cols}
          onChange={(v) => setCol("hourly_hours_col", v)}
        />
        <SelectRow
          label="Дисциплина"
          value={cfg.columns.discipline_col}
          cols={cols}
          onChange={(v) => setCol("discipline_col", v)}
        />
        <SelectRow
          label="Вид занятий"
          value={cfg.columns.activity_type_col}
          cols={cols}
          onChange={(v) => setCol("activity_type_col", v)}
        />
        <SelectRow
          label="Группа"
          value={cfg.columns.group_col}
          cols={cols}
          onChange={(v) => setCol("group_col", v)}
        />
        <SelectRow
          label="ОП / программа"
          value={cfg.columns.op_col}
          cols={cols}
          onChange={(v) => setCol("op_col", v)}
        />

        <div className="hr" />

        <div className="section-title" style={{ marginTop: 14 }}>
          Распознавание видов занятий
        </div>

        <TextRow
          label="Лекции"
          value={(cfg.activity_types?.lecture || []).join(", ")}
          onChange={(v) => setActivityPatterns("lecture", v)}
          placeholder="лек, лк, lecture"
        />
        <TextRow
          label="Лаб/практики"
          value={(cfg.activity_types?.lab_practice || []).join(", ")}
          onChange={(v) => setActivityPatterns("lab_practice", v)}
          placeholder="лаб, пра, lab, pract"
        />

        <div className="hr" style={{ marginTop: 18 }} />

        <button
          className="btn btn-outline"
          onClick={() => setAdvancedOpen((v) => !v)}
          type="button"
        >
          {advancedOpen
            ? "Скрыть расширенные настройки"
            : "Расширенные настройки"}
        </button>

        {advancedOpen ? (
          <div style={{ marginTop: 14 }}>
            <CheckboxMultiSelect
              label="По каким колонкам объединять строки"
              options={colOptions}
              value={cfg.merge_rules?.key_cols || []}
              onChange={(arr) => setMergeRuleArray("key_cols", arr)}
            />

            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              <div style={{ width: 260, fontWeight: 700 }}>
                Приоритет группы
              </div>
              <select
                className="input"
                style={{ width: 260 }}
                value={cfg.merge_rules?.group_priority_type || "lecture"}
                onChange={(e) =>
                  setMergeRule("group_priority_type", e.target.value)
                }
              >
                <option value="lecture">Лекции</option>
                <option value="lab_practice">Лаб/практики</option>
              </select>
            </div>

            <CheckboxMultiSelect
              label="Колонки суммирования для лекций"
              options={colOptions}
              value={cfg.merge_rules?.sum_cols_by_type?.lecture || []}
              onChange={(arr) => setSumColsByType("lecture", arr)}
            />

            <CheckboxMultiSelect
              label="Колонки суммирования для лаб/практик"
              options={colOptions}
              value={cfg.merge_rules?.sum_cols_by_type?.lab_practice || []}
              onChange={(arr) => setSumColsByType("lab_practice", arr)}
            />
          </div>
        ) : null}

        <div className="actions-row" style={{ marginTop: 18 }}>
          <button
            className="btn btn-primary"
            onClick={saveSettings}
            disabled={!excelTemplateId}
          >
            СОХРАНИТЬ
          </button>

          <button
            className="btn btn-outline"
            onClick={() => navigate("/manual-tables")}
            disabled={!rawTemplateInfo}
          >
            ПЕРЕЙТИ К ТАБЛИЦАМ
          </button>
        </div>

        <div className="hr" style={{ marginTop: 18 }} />

        <div className="section-title" style={{ marginTop: 14 }}>
          Автоматически найденные блоки нагрузки
        </div>

        <div className="small" style={{ marginBottom: 10 }}>
          {blocksStatus ||
            "Система использует эти блоки для построения таблиц учебной нагрузки"}
        </div>

        <BlocksSection blocks={blocksData.blocks || []} />
      </div>
    </div>
  );
}

function SelectRow({ label, value, cols, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 10,
      }}
    >
      <div style={{ width: 260, fontWeight: 700 }}>{label}</div>
      <select
        className="input"
        style={{ width: 680 }}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {cols.map((c) => (
          <option key={c.column_name} value={c.column_name}>
            {c.header_text}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextRow({ label, value, onChange, placeholder }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 10,
      }}
    >
      <div style={{ width: 260, fontWeight: 700 }}>{label}</div>
      <input
        className="input"
        style={{ width: 680 }}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function CheckboxMultiSelect({ label, options, value, onChange }) {
  const set = useMemo(() => new Set(value || []), [value]);

  function toggle(opt) {
    const next = new Set(set);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onChange(Array.from(next));
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>

      <div
        className="card"
        style={{
          borderRadius: 12,
          padding: 10,
          border: "1px solid rgba(15,23,42,.10)",
          maxHeight: 220,
          overflow: "auto",
          background: "#fff",
        }}
      >
        {!options.length ? (
          <div className="small">Нет колонок</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            {options.map((opt) => (
              <label
                key={opt}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(15,23,42,.08)",
                  background: set.has(opt)
                    ? "rgba(47,107,255,.08)"
                    : "transparent",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={set.has(opt)}
                  onChange={() => toggle(opt)}
                  style={{ transform: "scale(1.05)" }}
                />
                <span
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 13,
                  }}
                >
                  {opt}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BlocksSection({ blocks }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Block</th>
            <th>Описание</th>
            <th>Тип</th>
          </tr>
        </thead>
        <tbody>
          {!blocks.length ? (
            <tr>
              <td colSpan="3">Нет найденных блоков</td>
            </tr>
          ) : (
            blocks.map((b) => (
              <tr key={b.key}>
                <td style={{ fontWeight: 800 }}>{b.key}</td>
                <td>{b.title || ""}</td>
                <td>{b.type || "loop"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}