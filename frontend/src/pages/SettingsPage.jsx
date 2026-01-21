import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

function copyToClipboard(text) {
  navigator.clipboard.writeText(text || "");
}

export default function SettingsPage() {
  const navigate = useNavigate();

  const [excelTemplateId, setExcelTemplateId] = useState(localStorage.getItem("excel_template_id") || "");
  const [docxTemplateId, setDocxTemplateId] = useState(localStorage.getItem("docx_template_id") || "");

  const [cols, setCols] = useState([]);
  const [settingsStatus, setSettingsStatus] = useState("");

  const [cfg, setCfg] = useState({
    columns: {
      teacher_col: "",
      sem1_col: "",
      sem2_col: "",
      staff_hours_col: "",
      hourly_hours_cols: "",
    }
  });

  async function loadColumns() {
    if (!excelTemplateId) {
      setSettingsStatus("Нет excel_template_id");
      return;
    }
    try {
      setSettingsStatus("Загрузка колонок Excel...");
      const res = await api.get(`/excel/${excelTemplateId}/columns`);
      setCols(res.data || []);
      setSettingsStatus("");
    } catch (e) {
      console.error(e);
      setSettingsStatus("Ошибка загрузки колонок");
    }
  }

  async function loadCurrentSettings() {
    if (!excelTemplateId || !docxTemplateId) return;
    try {
      const res = await api.get("/settings/current", {
        params: { excel_template_id: excelTemplateId, docx_template_id: docxTemplateId }
      });

      if (res.data?.exists) {
        const loaded = res.data.config || {};
        const c = loaded.columns || {};

        let hourly = c.hourly_hours_cols;
        if (Array.isArray(hourly)) hourly = hourly[0] || "";
        if (hourly == null) hourly = "";

        setCfg({
          ...loaded,
          columns: {
            teacher_col: c.teacher_col || "",
            sem1_col: c.sem1_col || "",
            sem2_col: c.sem2_col || "",
            staff_hours_col: c.staff_hours_col || "",
            hourly_hours_cols: hourly || "",
          }
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  function setOne(key, value) {
    setCfg(prev => ({ ...prev, columns: { ...prev.columns, [key]: value } }));
  }

  async function saveSettings() {
    if (!excelTemplateId || !docxTemplateId) {
      setSettingsStatus("Нужно указать excel_template_id и docx_template_id");
      return;
    }
    const c = cfg.columns || {};
    if (!c.teacher_col || !c.sem1_col || !c.sem2_col || !c.staff_hours_col) {
      setSettingsStatus("Обязательные: teacher_col, sem1_col, sem2_col, staff_hours_col");
      return;
    }

    try {
      setSettingsStatus("Сохранение...");
      const res = await api.post("/settings/save", {
        excel_template_id: Number(excelTemplateId),
        docx_template_id: Number(docxTemplateId),
        config: cfg
      });
      setSettingsStatus(`Сохранено ✅ settings_id=${res.data.settings_id}`);
    } catch (e) {
      console.error(e);
      setSettingsStatus(e?.response?.data?.detail || "Ошибка сохранения");
    }
  }

  const [phData, setPhData] = useState({ stable: [], dynamic: [] });
  const [phStatus, setPhStatus] = useState("");

  const grouped = useMemo(() => {
    const stableTeacher = (phData.stable || []).filter(i => i.category === "teacher");
    const stableLoop = (phData.stable || []).filter(i => i.category === "loop");
    const dynamicRow = phData.dynamic || [];
    return { stableTeacher, stableLoop, dynamicRow };
  }, [phData]);

  async function loadPlaceholders() {
    if (!excelTemplateId) {
      setPhStatus("Нет excel_template_id. Сначала загрузи Excel.");
      return;
    }
    try {
      setPhStatus("Загрузка плейсхолдеров...");
      const res = await api.get("/placeholders", { params: { excel_template_id: excelTemplateId } });
      setPhData(res.data || { stable: [], dynamic: [] });
      setPhStatus("");
    } catch (e) {
      console.error(e);
      setPhStatus("Ошибка: плейсхолдеры не загрузились");
    }
  }

  function persistExcelId(v) {
    setExcelTemplateId(v);
    localStorage.setItem("excel_template_id", v);
  }
  function persistDocxId(v) {
    setDocxTemplateId(v);
    localStorage.setItem("docx_template_id", v);
  }

  useEffect(() => {
    loadColumns();
    loadCurrentSettings();
    loadPlaceholders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container">
      <div className="page-title">Настройка генерации (пара Excel + DOCX)</div>

      <div className="card card-pad">
        <div className="section-title">IDs</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <input
            className="input"
            style={{ width: 220 }}
            value={excelTemplateId}
            onChange={(e) => persistExcelId(e.target.value)}
            placeholder="excel_template_id"
          />
          <input
            className="input"
            style={{ width: 220 }}
            value={docxTemplateId}
            onChange={(e) => persistDocxId(e.target.value)}
            placeholder="docx_template_id"
          />
        </div>

        <div className="hr" />

        <div className="section-title" style={{ marginTop: 14 }}>
          Настройки генерации (пара Excel + DOCX)
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <button
            className="btn btn-outline"
            onClick={() => { loadColumns(); loadCurrentSettings(); }}
          >
            Обновить настройки
          </button>
          <div className="small">{settingsStatus}</div>
        </div>

        <div className="section-title">Обязательные привязки (по column_name)</div>

        <SelectRow
          label="teacher_col (колонка ФИО)"
          value={cfg.columns.teacher_col}
          cols={cols}
          onChange={(v) => setOne("teacher_col", v)}
        />
        <SelectRow
          label="sem1_col (колонка 1 семестр)"
          value={cfg.columns.sem1_col}
          cols={cols}
          onChange={(v) => setOne("sem1_col", v)}
        />
        <SelectRow
          label="sem2_col (колонка 2 семестр)"
          value={cfg.columns.sem2_col}
          cols={cols}
          onChange={(v) => setOne("sem2_col", v)}
        />
        <SelectRow
          label="staff_hours_col (колонка штатной нагрузки)"
          value={cfg.columns.staff_hours_col}
          cols={cols}
          onChange={(v) => setOne("staff_hours_col", v)}
        />

        <SelectRow
          label="hourly_hours_cols (почасовая нагрузка)"
          value={cfg.columns.hourly_hours_cols}
          cols={cols}
          onChange={(v) => setOne("hourly_hours_cols", v)}
        />

        <div className="actions-row" style={{ marginTop: 16 }}>
          <div className="small">
            Сохраняется на пару: Excel #{excelTemplateId || "—"} + DOCX #{docxTemplateId || "—"}
          </div>
          <button className="btn btn-primary" onClick={saveSettings}>СОХРАНИТЬ</button>
        </div>

        <div className="hr" style={{ marginTop: 18 }} />

        <div className="section-title" style={{ marginTop: 14 }}>
          Плейсхолдеры (Excel → row.*)
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <button className="btn btn-outline" onClick={loadPlaceholders}>Обновить плейсхолдеры</button>
          <div className="small">{phStatus}</div>
        </div>

        <div className="small" style={{ marginBottom: 14 }}>
          Инструкция: открой DOCX в Word → вставь плейсхолдеры.
          <br />
          <b>Стабильные:</b> teacher.* и loops. <b>Динамичные:</b> row.* (строго из выбранного Excel).
          <br />
          После вставки перейди на вкладку <b>DOCX</b> и загрузи шаблон (он свяжется с этим Excel).
        </div>

        <Section title="Стабильные: teacher.*" items={grouped.stableTeacher} />
        <Section title="Стабильные: loops" items={grouped.stableLoop} />
        <Section title="Динамичные: row.* (из Excel)" items={grouped.dynamicRow} />

        <div className="actions-row" style={{ marginTop: 16 }}>
          <div className="small">
            Stable: {(phData.stable || []).length} | Dynamic: {(phData.dynamic || []).length}
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
      <div style={{ width: 360, fontWeight: 700 }}>{label}</div>
      <select className="input" style={{ width: 520 }} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">— выбрать —</option>
        {cols.map(c => (
          <option key={c.column_name} value={c.column_name}>
            {c.column_name} — {c.header_text}
          </option>
        ))}
      </select>
    </div>
  );
}

function Section({ title, items }) {
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
              <tr><td colSpan="4">Нет данных</td></tr>
            ) : (
              items.map((p) => (
                <tr key={p.placeholder_name}>
                  <td style={{ fontWeight: 800 }}>{p.placeholder_name}</td>
                  <td>{p.description || ""}</td>
                  <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                    {p.example || ""}
                  </td>
                  <td>
                    <button className="btn btn-primary" onClick={() => copyToClipboard(p.example || "")}>
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
