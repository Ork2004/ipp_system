import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

function copyToClipboard(text) {
  navigator.clipboard.writeText(text || "");
}

export default function SettingsPage() {
  const navigate = useNavigate();

  const [departmentId, setDepartmentId] = useState(Number(localStorage.getItem("department_id") || 0));

  const [excelTemplates, setExcelTemplates] = useState([]);
  const [docxTemplates, setDocxTemplates] = useState([]);

  const [academicYear, setAcademicYear] = useState(localStorage.getItem("academic_year") || "2025-2026");

  const [excelTemplateId, setExcelTemplateId] = useState(localStorage.getItem("excel_template_id") || "");
  const [docxTemplateId, setDocxTemplateId] = useState(localStorage.getItem("docx_template_id") || "");

  const [cols, setCols] = useState([]);
  const [settingsStatus, setSettingsStatus] = useState("");

  const [cfg, setCfg] = useState({
    columns: {
      teacher_col: "",
      staff_hours_col: "",
      hourly_hours_col: "",
    },
  });

  const [phData, setPhData] = useState({ stable: [], dynamic: [] });
  const [phStatus, setPhStatus] = useState("");

  const [blocksData, setBlocksData] = useState({ blocks: [], semester_map: {} });
  const [blocksStatus, setBlocksStatus] = useState("");

  const years = useMemo(() => {
    const set = new Set((excelTemplates || []).map((t) => t.academic_year).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [excelTemplates]);

  const excelForYear = useMemo(() => {
    if (!academicYear) return excelTemplates;
    return (excelTemplates || []).filter((t) => t.academic_year === academicYear);
  }, [excelTemplates, academicYear]);

  const currentExcelLabel = useMemo(() => {
    const t = (excelTemplates || []).find((x) => String(x.id) === String(excelTemplateId));
    return t ? (t.source_filename || "excel.xlsx") : "";
  }, [excelTemplates, excelTemplateId]);

  const currentDocxLabel = useMemo(() => {
    const t = (docxTemplates || []).find((x) => String(x.id) === String(docxTemplateId));
    return t ? (t.source_filename || "template.docx") : "";
  }, [docxTemplates, docxTemplateId]);

  function persistExcelId(v) {
    setExcelTemplateId(v);
    if (v) localStorage.setItem("excel_template_id", v);
    else localStorage.removeItem("excel_template_id");
  }

  function persistDocxId(v) {
    setDocxTemplateId(v);
    if (v) localStorage.setItem("docx_template_id", v);
    else localStorage.removeItem("docx_template_id");
  }

  function setOne(key, value) {
    setCfg((prev) => ({ ...prev, columns: { ...prev.columns, [key]: value } }));
  }

  async function loadExcelTemplates() {
    if (!departmentId) {
      setSettingsStatus("Нет department_id. Выйди и зайди заново.");
      return;
    }
    try {
      setSettingsStatus("Загрузка Excel шаблонов...");
      const res = await api.get("/excel/templates", { params: { department_id: departmentId } });
      setExcelTemplates(res.data || []);
      setSettingsStatus("");
    } catch (e) {
      console.error(e);
      setSettingsStatus(e?.response?.data?.detail || "Ошибка загрузки Excel шаблонов");
    }
  }

  async function loadDocxTemplates() {
    if (!departmentId) return;
    try {
      const res = await api.get("/docx/templates", { params: { department_id: departmentId } });
      setDocxTemplates(res.data || []);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadColumns(targetExcelId) {
    const id = targetExcelId || excelTemplateId;
    if (!id) {
      setSettingsStatus("Выбери Excel");
      return;
    }
    try {
      setSettingsStatus("Загрузка колонок Excel...");
      const res = await api.get(`/excel/${id}/columns`);
      setCols(res.data || []);
      setSettingsStatus("");
    } catch (e) {
      console.error(e);
      setSettingsStatus("Ошибка загрузки колонок");
    }
  }

  async function loadCurrentSettings(targetExcelId, targetDocxId) {
    const ex = targetExcelId || excelTemplateId;
    const dx = targetDocxId || docxTemplateId;
    if (!ex || !dx) return;

    try {
      const res = await api.get("/settings/current", {
        params: { excel_template_id: ex, docx_template_id: dx },
      });

      if (res.data?.exists) {
        const loaded = res.data.config || {};
        const c = loaded.columns || {};
        setCfg({
          ...loaded,
          columns: {
            teacher_col: c.teacher_col || "",
            staff_hours_col: c.staff_hours_col || "",
            hourly_hours_col: c.hourly_hours_col || "",
          },
        });
      } else {
        setCfg((prev) => ({
          ...prev,
          columns: {
            teacher_col: prev.columns.teacher_col || "",
            staff_hours_col: prev.columns.staff_hours_col || "",
            hourly_hours_col: prev.columns.hourly_hours_col || "",
          },
        }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadPlaceholders(targetExcelId) {
    const ex = targetExcelId || excelTemplateId;
    if (!ex) {
      setPhStatus("Выбери Excel");
      return;
    }
    try {
      setPhStatus("Загрузка плейсхолдеров...");
      const res = await api.get("/placeholders", { params: { excel_template_id: ex } });
      setPhData(res.data || { stable: [], dynamic: [] });
      setPhStatus("");
    } catch (e) {
      console.error(e);
      setPhStatus("Ошибка загрузки плейсхолдеров");
    }
  }

  async function loadBlocks(targetExcelId) {
    const ex = targetExcelId || excelTemplateId;
    if (!ex) {
      setBlocksStatus("Выбери Excel");
      return;
    }
    try {
      setBlocksStatus("Загрузка blocks...");
      const res = await api.get("/blocks/available", { params: { excel_template_id: ex } });
      setBlocksData(res.data || { blocks: [], semester_map: {} });
      setBlocksStatus("");
    } catch (e) {
      console.error(e);
      setBlocksStatus(e?.response?.data?.detail || "Ошибка загрузки blocks");
    }
  }

  async function saveSettings() {
    if (!excelTemplateId || !docxTemplateId) {
      setSettingsStatus("Выбери Excel и DOCX");
      return;
    }

    const c = cfg.columns || {};
    if (!c.teacher_col || !c.staff_hours_col) {
      setSettingsStatus("Обязательные: teacher_col и staff_hours_col");
      return;
    }

    try {
      setSettingsStatus("Сохранение...");
      const res = await api.post("/settings/save", {
        excel_template_id: Number(excelTemplateId),
        docx_template_id: Number(docxTemplateId),
        config: cfg,
      });
      setSettingsStatus(`Сохранено ✅`);

      await loadBlocks(excelTemplateId);
    } catch (e) {
      console.error(e);
      setSettingsStatus(e?.response?.data?.detail || "Ошибка сохранения");
    }
  }

  const grouped = useMemo(() => {
    const stableTeacher = (phData.stable || []).filter((i) => i.category === "teacher");
    const dynamicRow = phData.dynamic || [];
    return { stableTeacher, dynamicRow };
  }, [phData]);

  useEffect(() => {
    const dep = Number(localStorage.getItem("department_id") || 0);
    setDepartmentId(dep);

    (async () => {
      await loadExcelTemplates();
      await loadDocxTemplates();
    })();
  }, []);

  useEffect(() => {
    if (!excelTemplates.length) return;

    const list = excelForYear;
    if (!list.length) return;

    const exists = list.some((t) => String(t.id) === String(excelTemplateId));
    if (!exists) {
      const firstId = String(list[0].id);
      persistExcelId(firstId);
      localStorage.setItem("academic_year", list[0].academic_year || academicYear);
      setAcademicYear(list[0].academic_year || academicYear);
    }
  }, [excelTemplates, academicYear]);

  useEffect(() => {
    if (!excelTemplateId) return;

    (async () => {
      await loadColumns(excelTemplateId);
      await loadPlaceholders(excelTemplateId);
      await loadBlocks(excelTemplateId);
      await loadCurrentSettings(excelTemplateId, docxTemplateId);
    })();
  }, [excelTemplateId]);

  useEffect(() => {
    if (!excelTemplateId || !docxTemplateId) return;
    loadCurrentSettings(excelTemplateId, docxTemplateId);
  }, [docxTemplateId]);

  return (
    <div className="container">
      <div className="page-title">Настройка генерации</div>

      <div className="card card-pad">
        <div className="section-title">1) Выбор Excel и DOCX</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <select
            className="input"
            style={{ width: 200 }}
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

          <select
            className="input"
            style={{ width: 420 }}
            value={excelTemplateId}
            onChange={(e) => persistExcelId(e.target.value)}
          >
            {!excelForYear.length ? (
              <option value="">Нет Excel для выбранного года</option>
            ) : (
              excelForYear.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.source_filename || "excel.xlsx"} {t.is_active ? "(active)" : ""}
                </option>
              ))
            )}
          </select>

          <select
            className="input"
            style={{ width: 420 }}
            value={docxTemplateId}
            onChange={(e) => persistDocxId(e.target.value)}
          >
            {!docxTemplates.length ? (
              <option value="">Нет DOCX</option>
            ) : (
              docxTemplates.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.source_filename || "template.docx"} — {t.academic_year || ""}
                  {t.is_active ? " (active)" : ""}
                </option>
              ))
            )}
          </select>

          <button
            className="btn btn-outline"
            onClick={async () => {
              await loadExcelTemplates();
              await loadDocxTemplates();
            }}
          >
            Обновить списки
          </button>

          <div className="small">{settingsStatus}</div>
        </div>

        <div className="small" style={{ marginBottom: 10 }}>
          Выбрано: <b>Excel</b> — {currentExcelLabel || "—"} | <b>DOCX</b> — {currentDocxLabel || "—"}
        </div>

        <div className="hr" />

        <div className="section-title" style={{ marginTop: 14 }}>
          2) Маппинг колонок
        </div>

        <div className="small" style={{ marginBottom: 12 }}>
          Выбери колонку <b>ФИО</b> и колонку <b>штатные часы</b>. Семестры система найдёт сама.
        </div>

        <SelectRow
          label="teacher_col (ФИО преподавателя)"
          value={cfg.columns.teacher_col}
          cols={cols}
          onChange={(v) => setOne("teacher_col", v)}
        />

        <SelectRow
          label="staff_hours_col (штатные часы)"
          value={cfg.columns.staff_hours_col}
          cols={cols}
          onChange={(v) => setOne("staff_hours_col", v)}
        />

        <SelectRow
          label="hourly_hours_col (почасовые часы, если есть)"
          value={cfg.columns.hourly_hours_col}
          cols={cols}
          onChange={(v) => setOne("hourly_hours_col", v)}
        />

        <div className="actions-row" style={{ marginTop: 14 }}>
          <div className="small">Сохраняется для выбранной пары Excel + DOCX</div>
          <button className="btn btn-primary" onClick={saveSettings}>
            СОХРАНИТЬ
          </button>
        </div>

        <div className="hr" style={{ marginTop: 18 }} />

        <div className="section-title" style={{ marginTop: 14 }}>
          3) Что вставлять в DOCX
        </div>

        <div className="small" style={{ marginBottom: 12 }}>
          1) Скопируй нужные <b>teacher.*</b>, <b>row.*</b> и <b>blocks</b> отсюда
          <br />
          2) Вставь их в Word-шаблон
          <br />
          3) Загрузи DOCX во вкладке DOCX
          <br />
          4) Вернись и нажми <b>Сохранить</b>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <button className="btn btn-outline" onClick={() => loadPlaceholders(excelTemplateId)}>
            Обновить teacher.* / row.*
          </button>
          <button className="btn btn-outline" onClick={() => loadBlocks(excelTemplateId)}>
            Обновить blocks
          </button>
          <div className="small">{phStatus || blocksStatus}</div>
        </div>

        <Section title="Стабильные: teacher.*" items={grouped.stableTeacher} copyField="example" />
        <Section title="Динамичные: row.* (из Excel)" items={grouped.dynamicRow} copyField="example" />
        <BlocksSection title="Blocks (loops): готовые циклы для таблиц" blocks={blocksData.blocks || []} />

        <div className="actions-row" style={{ marginTop: 16 }}>
          <div className="small">
            teacher.*: {(grouped.stableTeacher || []).length} | row.*: {(grouped.dynamicRow || []).length} | blocks:{" "}
            {(blocksData.blocks || []).length}
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/docx-upload")}>
            ДАЛЕЕ: ЗАГРУЗИТЬ DOCX
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectRow({ label, value, cols, onChange }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
      <div style={{ width: 320, fontWeight: 700 }}>{label}</div>
      <select className="input" style={{ width: 620 }} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">— выбрать —</option>
        {cols.map((c) => (
          <option key={c.column_name} value={c.column_name}>
            {c.header_text}
          </option>
        ))}
      </select>
    </div>
  );
}

function Section({ title, items, copyField }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div className="section-title">{title}</div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Placeholder</th>
              <th>Описание</th>
              <th>Пример</th>
              <th style={{ width: 120 }}>Действие</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan="4">Нет данных</td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.placeholder_name}>
                  <td style={{ fontWeight: 800 }}>{p.placeholder_name}</td>
                  <td>{p.description || ""}</td>
                  <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                    {p[copyField] || ""}
                  </td>
                  <td>
                    <button className="btn btn-primary" onClick={() => copyToClipboard(p[copyField] || "")}>
                      Copy
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BlocksSection({ title, blocks }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div className="section-title">{title}</div>

      <div className="small" style={{ marginBottom: 10 }}>
        Это готовые циклы для Word-таблиц. Их нельзя придумывать вручную — просто копируй.
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Block</th>
              <th>Описание</th>
              <th>Snippet</th>
              <th style={{ width: 120 }}>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!blocks.length ? (
              <tr>
                <td colSpan="4">Нет blocks. Проверь Excel.</td>
              </tr>
            ) : (
              blocks.map((b) => (
                <tr key={b.key}>
                  <td style={{ fontWeight: 800 }}>{b.key}</td>
                  <td>{b.title || ""}</td>
                  <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", whiteSpace: "pre-wrap" }}>
                    {b.snippet || ""}
                  </td>
                  <td>
                    <button className="btn btn-primary" onClick={() => copyToClipboard(b.snippet || "")}>
                      Copy
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
