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
      staff_hours_col: "",
      hourly_hours_col: "",
    }
  });

  const [phData, setPhData] = useState({ stable: [], dynamic: [] });
  const [phStatus, setPhStatus] = useState("");

  const [blocksData, setBlocksData] = useState({ blocks: [], semester_map: {} });
  const [blocksStatus, setBlocksStatus] = useState("");

  function persistExcelId(v) {
    setExcelTemplateId(v);
    localStorage.setItem("excel_template_id", v);
  }
  function persistDocxId(v) {
    setDocxTemplateId(v);
    localStorage.setItem("docx_template_id", v);
  }

  function setOne(key, value) {
    setCfg(prev => ({ ...prev, columns: { ...prev.columns, [key]: value } }));
  }

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

        setCfg({
          ...loaded,
          columns: {
            teacher_col: c.teacher_col || "",
            staff_hours_col: c.staff_hours_col || "",
            hourly_hours_col: c.hourly_hours_col || "",
          }
        });
      } else {
        setCfg(prev => ({
          ...prev,
          columns: {
            teacher_col: prev.columns.teacher_col || "",
            staff_hours_col: prev.columns.staff_hours_col || "",
            hourly_hours_col: prev.columns.hourly_hours_col || "",
          }
        }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function saveSettings() {
    if (!excelTemplateId || !docxTemplateId) {
      setSettingsStatus("Нужно указать excel_template_id и docx_template_id");
      return;
    }

    const c = cfg.columns || {};
    if (!c.teacher_col || !c.staff_hours_col) {
      setSettingsStatus("Обязательные: teacher_col, staff_hours_col");
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

      await loadBlocks();
    } catch (e) {
      console.error(e);
      setSettingsStatus(e?.response?.data?.detail || "Ошибка сохранения");
    }
  }

  const grouped = useMemo(() => {
    const stableTeacher = (phData.stable || []).filter(i => i.category === "teacher");
    const dynamicRow = phData.dynamic || [];
    return { stableTeacher, dynamicRow };
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

  async function loadBlocks() {
  if (!excelTemplateId) {
    setBlocksStatus("Чтобы увидеть blocks (loops): сначала загрузи Excel и выбери excel_template_id");
    return;
  }
  try {
    setBlocksStatus("Загрузка blocks (loops)...");
    const res = await api.get("/blocks/available", {
      params: { excel_template_id: excelTemplateId }
    });
    setBlocksData(res.data || { blocks: [], semester_map: {} });
    setBlocksStatus("");
  } catch (e) {
    console.error(e);
    setBlocksStatus(e?.response?.data?.detail || "Ошибка загрузки blocks");
  }
}


  useEffect(() => {
    loadColumns();
    loadCurrentSettings();
    loadPlaceholders();
    loadBlocks();
  }, []);

  return (
    <div className="container">
      <div className="page-title">Настройка генерации (Excel + DOCX)</div>

      <div className="card card-pad">
        <div className="section-title">1) IDs</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
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

          <button className="btn btn-outline" onClick={async () => {
            await loadColumns();
            await loadCurrentSettings();
            await loadPlaceholders();
            await loadBlocks();
          }}>
            Обновить всё
          </button>

          <div className="small">{settingsStatus}</div>
        </div>

        <div className="hr" />

        <div className="section-title" style={{ marginTop: 14 }}>
          2) Настройки (маппинг колонок)
        </div>

        <div className="small" style={{ marginBottom: 12 }}>
          Здесь ты говоришь системе: <b>где в Excel ФИО</b> и <b>какая колонка — “штатные часы”</b>.
          Семестры система найдёт сама по заголовкам (например “1 сем”, “2 сем”, “3 сем”…).
        </div>

        <SelectRow
          label="teacher_col (колонка с ФИО преподавателя)"
          value={cfg.columns.teacher_col}
          cols={cols}
          onChange={(v) => setOne("teacher_col", v)}
        />

        <SelectRow
          label="staff_hours_col (часы штатной нагрузки)"
          value={cfg.columns.staff_hours_col}
          cols={cols}
          onChange={(v) => setOne("staff_hours_col", v)}
        />

        <SelectRow
          label="hourly_hours_col (часы почасовой нагрузки, если есть)"
          value={cfg.columns.hourly_hours_col}
          cols={cols}
          onChange={(v) => setOne("hourly_hours_col", v)}
        />

        <div className="actions-row" style={{ marginTop: 14 }}>
          <div className="small">
            Сохраняется для: Excel #{excelTemplateId || "—"} + DOCX #{docxTemplateId || "—"}
          </div>
          <button className="btn btn-primary" onClick={saveSettings}>СОХРАНИТЬ</button>
        </div>

        <div className="hr" style={{ marginTop: 18 }} />

        <div className="section-title" style={{ marginTop: 14 }}>
          3) Плейсхолдеры и Blocks (что вставлять в DOCX)
        </div>

        <div className="small" style={{ marginBottom: 12 }}>
          Как работать:
          <br />1) Загрузи Excel
          <br />2) Здесь скопируй нужные <b>teacher.*</b>, <b>row.*</b> и <b>blocks (loops)</b> → вставь в DOCX
          <br />3) Перейди в <b>DOCX</b> и загрузи шаблон
          <br />4) Нажми <b>Сохранить</b> (настройки) → потом <b>Generate</b>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <button className="btn btn-outline" onClick={loadPlaceholders}>Обновить teacher.* / row.*</button>
          <button className="btn btn-outline" onClick={loadBlocks}>Обновить blocks (loops)</button>
          <div className="small">{phStatus || blocksStatus}</div>
        </div>

        <Section
          title="Стабильные: teacher.*"
          items={grouped.stableTeacher}
          copyField="example"
        />

        <Section
          title="Динамичные: row.* (из Excel)"
          items={grouped.dynamicRow}
          copyField="example"
        />

        <BlocksSection
          title="Blocks (loops): готовые таблицы"
          blocks={blocksData.blocks || []}
        />

        <div className="actions-row" style={{ marginTop: 16 }}>
          <div className="small">
            teacher.*: {(grouped.stableTeacher || []).length} | row.*: {(grouped.dynamicRow || []).length} | blocks: {(blocksData.blocks || []).length}
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
              <tr><td colSpan="4">Нет данных</td></tr>
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
        Это <b>готовые циклы</b> для таблиц в DOCX. Их нельзя придумывать вручную — просто копируй.
        <br />
        Если в Excel появится “3 семестр” — тут автоматически появится новый блок.
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Block key</th>
              <th>Описание</th>
              <th>Snippet для Word (вставляй в строку таблицы)</th>
              <th style={{ width: 120 }}>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!blocks.length ? (
              <tr><td colSpan="4">Нет blocks. Проверь: загружен Excel и выбран excel_template_id.</td></tr>
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
