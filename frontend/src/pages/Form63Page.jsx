import { useEffect, useState } from "react";
import { api } from "../api";

export default function Form63Page() {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(null);

  const departmentId = localStorage.getItem("department_id");
  const academicYear = localStorage.getItem("academic_year");

  useEffect(() => {
    async function loadTemplateInfo() {
      setError("");
      setLoading(true);

      try {
        if (!departmentId || !academicYear) {
          throw new Error("Не найден department_id или academic_year в localStorage");
        }

        const res = await api.get(`/excel/templates?department_id=${departmentId}`);
        const templates = Array.isArray(res.data) ? res.data : [];

        const current = templates.find(
          (t) => String(t.academic_year) === String(academicYear)
        );

        if (!current) {
          throw new Error(
            `Не найден Excel шаблон для кафедры ${departmentId} и года ${academicYear}`
          );
        }

        setInfo({
          excelTemplateId: current.id,
          sourceFilename: current.source_filename,
          academicYear: current.academic_year,
          departmentId: departmentId,
        });
      } catch (e) {
        setError(e?.response?.data?.detail || e.message || "Ошибка загрузки данных");
      } finally {
        setLoading(false);
      }
    }

    loadTemplateInfo();
  }, [departmentId, academicYear]);

  async function handleDownload() {
    if (!info?.excelTemplateId) return;

    setError("");
    setDownloading(true);

    try {
      const res = await api.get(
        `/form63/export-template?excel_template_id=${info.excelTemplateId}`,
        {
          responseType: "blob",
        }
      );

      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `form63_${info.academicYear}.xlsx`;
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

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Форма 63</h1>
        <p style={styles.subtitle}>
          Автоматическое формирование Excel-файла на основе загруженной нагрузки
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
            <span style={styles.label}>Excel шаблон:</span>
            <span>{info?.sourceFilename || "-"}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Excel template ID:</span>
            <span>{info?.excelTemplateId || "-"}</span>
          </div>
        </div>

        {loading && <div style={styles.status}>Загрузка данных...</div>}
        {error && <div style={styles.error}>{error}</div>}

        <button
          style={styles.button}
          onClick={handleDownload}
          disabled={loading || downloading || !info?.excelTemplateId}
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
    maxWidth: "760px",
    margin: "0 auto",
    background: "#fff",
    borderRadius: "20px",
    padding: "28px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  title: {
    margin: 0,
    fontSize: "32px",
    fontWeight: 700,
    color: "#1e2a3a",
  },
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
    marginBottom: "20px",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    padding: "8px 0",
    borderBottom: "1px solid #eef1f6",
  },
  label: {
    fontWeight: 600,
    color: "#334155",
  },
  button: {
    marginTop: "12px",
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
};