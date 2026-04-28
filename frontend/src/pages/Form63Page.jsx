import { useEffect, useRef, useState } from "react";
import { api } from "../api";

const CATEGORY_LABELS = {
  row_number: "№",
  teacher_name: "ФИО ППС",
  position: "Должность",
  semester: "Семестр",
  teaching_auditory: "Учебная — аудиторная",
  teaching_extraauditory: "Учебная — внеаудиторная",
  methodical: "Учебно-методическая",
  research: "Научная",
  organizational_methodical: "Организационно-методическая",
  educational: "Воспитательная",
  qualification: "Повышение квалификации",
  social: "Общественная",
  total: "Итого",
  hourly_auditory: "Почасовая — аудиторная",
  hourly_extraauditory: "Почасовая — внеаудиторная",
};

const CATEGORY_ORDER = [
  "row_number",
  "teacher_name",
  "position",
  "semester",
  "teaching_auditory",
  "teaching_extraauditory",
  "methodical",
  "research",
  "organizational_methodical",
  "educational",
  "qualification",
  "social",
  "total",
  "hourly_auditory",
  "hourly_extraauditory",
];

export default function Form63Page() {
  const [excelInfo, setExcelInfo] = useState(null);
  const [form63Templates, setForm63Templates] = useState([]);
  const [selectedTplId, setSelectedTplId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [uploadFile, setUploadFile] = useState(null);
  const fileInputRef = useRef(null);

  const departmentId = localStorage.getItem("department_id");
  const academicYear = localStorage.getItem("academic_year");

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, academicYear]);

  async function refreshAll() {
    setError("");
    setLoading(true);
    try {
      if (!departmentId || !academicYear) {
        throw new Error("Не найден department_id или academic_year в localStorage");
      }

      const excelRes = await api.get(`/excel/templates?department_id=${departmentId}`);
      const excelTemplates = Array.isArray(excelRes.data) ? excelRes.data : [];
      const currentExcel = excelTemplates.find(
        (t) => String(t.academic_year) === String(academicYear),
      );
      if (!currentExcel) {
        throw new Error(
          `Не найден Excel шаблон с нагрузкой для кафедры ${departmentId} и года ${academicYear}`,
        );
      }
      setExcelInfo({
        excelTemplateId: currentExcel.id,
        sourceFilename: currentExcel.source_filename,
      });

      const tplRes = await api.get(`/form63/templates?department_id=${departmentId}`);
      const tpls = Array.isArray(tplRes.data) ? tplRes.data : [];
      setForm63Templates(tpls);
      const currentTpl = tpls.find(
        (t) => String(t.academic_year) === String(academicYear),
      );
      setSelectedTplId(currentTpl ? currentTpl.id : tpls[0]?.id ?? null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (!uploadFile) return;
    setError("");
    setInfo("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("department_id", departmentId);
      formData.append("academic_year", academicYear);
      formData.append("file", uploadFile);

      const res = await api.post("/form63/templates", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setInfo(`Шаблон "${res.data.source_filename}" загружен и распознан.`);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refreshAll();
      setSelectedTplId(res.data.id);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Ошибка загрузки шаблона");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Удалить шаблон Формы 63?")) return;
    setError("");
    try {
      await api.delete(`/form63/templates/${id}`);
      setInfo("Шаблон удалён.");
      await refreshAll();
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Ошибка удаления");
    }
  }

  async function handleDownload() {
    if (!excelInfo?.excelTemplateId || !selectedTplId) return;
    setError("");
    setDownloading(true);
    try {
      const res = await api.get(
        `/form63/export-template?excel_template_id=${excelInfo.excelTemplateId}&form63_template_id=${selectedTplId}`,
        { responseType: "blob" },
      );

      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `form63_${academicYear}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.response?.data?.detail || "Ошибка при скачивании Form 63");
    } finally {
      setDownloading(false);
    }
  }

  const selectedTpl = form63Templates.find((t) => t.id === selectedTplId) || null;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Форма 63</h1>
        <p style={styles.subtitle}>
          Загрузите актуальный шаблон Формы 63 — система распознает структуру
          и заполнит её данными по нагрузке.
        </p>

        <div style={styles.infoBox}>
          <div style={styles.row}>
            <span style={styles.label}>Кафедра ID:</span>
            <span>{departmentId || "-"}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Учебный год:</span>
            <span>{academicYear || "-"}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Excel с нагрузкой:</span>
            <span>{excelInfo?.sourceFilename || "—"}</span>
          </div>
        </div>

        {loading && <div style={styles.status}>Загрузка данных...</div>}
        {info && <div style={styles.statusOk}>{info}</div>}
        {error && <div style={styles.error}>{error}</div>}

        <h2 style={styles.h2}>Загрузить шаблон Формы 63</h2>
        <div style={styles.uploadBox}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
          />
          <button
            style={styles.secondaryButton}
            onClick={handleUpload}
            disabled={!uploadFile || uploading}
          >
            {uploading ? "Загрузка..." : "Загрузить и распознать"}
          </button>
        </div>

        <h2 style={styles.h2}>Загруженные шаблоны</h2>
        {form63Templates.length === 0 ? (
          <div style={styles.muted}>Пока нет шаблонов для кафедры.</div>
        ) : (
          <div style={styles.tplList}>
            {form63Templates.map((t) => (
              <label key={t.id} style={styles.tplItem}>
                <input
                  type="radio"
                  name="form63tpl"
                  checked={selectedTplId === t.id}
                  onChange={() => setSelectedTplId(t.id)}
                />
                <div style={styles.tplBody}>
                  <div style={styles.tplHeader}>
                    <strong>{t.source_filename || `Шаблон #${t.id}`}</strong>
                    <span style={styles.tplYear}>{t.academic_year}</span>
                  </div>
                  <div style={styles.tplMeta}>
                    Стартовая строка: <b>{t.data_start_row}</b> · колонок
                    распознано:{" "}
                    <b>{Object.keys(t.column_mapping || {}).length}</b>
                  </div>
                </div>
                <button
                  style={styles.deleteButton}
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete(t.id);
                  }}
                >
                  Удалить
                </button>
              </label>
            ))}
          </div>
        )}

        {selectedTpl && (
          <>
            <h2 style={styles.h2}>Распознанный маппинг колонок</h2>
            <div style={styles.mappingBox}>
              {CATEGORY_ORDER.map((cat) => (
                <div key={cat} style={styles.mappingRow}>
                  <span style={styles.mappingLabel}>{CATEGORY_LABELS[cat]}</span>
                  <span style={styles.mappingValue}>
                    {selectedTpl.column_mapping?.[cat] ? (
                      <code style={styles.code}>{selectedTpl.column_mapping[cat]}</code>
                    ) : (
                      <span style={styles.missing}>не найдено</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <button
          style={styles.button}
          onClick={handleDownload}
          disabled={
            loading ||
            downloading ||
            !excelInfo?.excelTemplateId ||
            !selectedTplId
          }
        >
          {downloading ? "Формирование..." : "Сформировать и скачать Form 63"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f7fb",
    padding: "32px",
  },
  card: {
    maxWidth: "820px",
    margin: "0 auto",
    background: "#fff",
    borderRadius: "20px",
    padding: "28px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  title: { margin: 0, fontSize: "32px", fontWeight: 700, color: "#1e2a3a" },
  h2: { marginTop: "28px", marginBottom: "12px", fontSize: "18px", color: "#1e2a3a" },
  subtitle: {
    marginTop: "10px",
    marginBottom: "24px",
    color: "#5b6472",
    fontSize: "16px",
  },
  infoBox: {
    border: "1px solid #e5e7eb",
    borderRadius: "14px",
    padding: "18px",
    background: "#fafbff",
    marginBottom: "10px",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    padding: "8px 0",
    borderBottom: "1px solid #eef1f6",
  },
  label: { fontWeight: 600, color: "#334155" },
  uploadBox: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    padding: "14px",
    border: "1px dashed #cbd5e1",
    borderRadius: "12px",
    background: "#fbfdff",
  },
  tplList: { display: "flex", flexDirection: "column", gap: "8px" },
  tplItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 14px",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    cursor: "pointer",
    background: "#fff",
  },
  tplBody: { flex: 1 },
  tplHeader: { display: "flex", justifyContent: "space-between" },
  tplYear: {
    fontSize: "13px",
    color: "#6b7280",
    background: "#f3f4f6",
    padding: "2px 8px",
    borderRadius: "8px",
  },
  tplMeta: { fontSize: "13px", color: "#6b7280", marginTop: "4px" },
  deleteButton: {
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#b91c1c",
    padding: "6px 10px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
  },
  mappingBox: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "6px 16px",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "14px",
    background: "#fafbff",
  },
  mappingRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "14px",
    padding: "4px 0",
  },
  mappingLabel: { color: "#334155" },
  mappingValue: { color: "#0f172a" },
  code: {
    background: "#eef2ff",
    color: "#3730a3",
    padding: "1px 6px",
    borderRadius: "6px",
    fontFamily: "monospace",
    fontSize: "13px",
  },
  missing: { color: "#b91c1c", fontStyle: "italic" },
  muted: { color: "#6b7280", fontSize: "14px" },
  button: {
    marginTop: "20px",
    width: "100%",
    border: "none",
    borderRadius: "14px",
    padding: "14px 18px",
    fontSize: "16px",
    fontWeight: 700,
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
  },
  secondaryButton: {
    border: "none",
    background: "#1e293b",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: 600,
  },
  error: {
    marginTop: "12px",
    padding: "12px 14px",
    borderRadius: "12px",
    background: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
  },
  status: {
    marginTop: "12px",
    padding: "12px 14px",
    borderRadius: "12px",
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
  },
  statusOk: {
    marginTop: "12px",
    padding: "12px 14px",
    borderRadius: "12px",
    background: "#ecfdf5",
    color: "#047857",
    border: "1px solid #a7f3d0",
  },
};
