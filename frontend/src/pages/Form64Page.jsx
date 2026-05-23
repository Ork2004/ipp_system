import { useEffect, useState } from "react";
import { api } from "../api";

const yearInputStyle = {
  width: 220,
  height: 52,
  borderRadius: 14,
  border: "1px solid #d9e3f5",
  background: "#f8fbff",
  boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
  color: "#17356f",
  WebkitTextFillColor: "#17356f",
  fontWeight: 700,
  fontSize: 16,
  padding: "0 16px",
  outline: "none",
  opacity: 1,
  caretColor: "#17356f",
};

const topLabelStyle = {
  fontSize: 14,
  fontWeight: 700,
  color: "#5f7195",
  marginBottom: 8,
};

function fmt(value) {
  const num = Math.round((Number(value) || 0) * 100) / 100;
  if (Math.abs(num - Math.round(num)) < 1e-9) return String(Math.round(num));
  return String(num).replace(".", ",");
}

export default function Form64Page() {
  const [excelInfo, setExcelInfo] = useState(null);
  const [teachers, setTeachers] = useState([]);

  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const departmentId = localStorage.getItem("department_id");
  const [academicYear, setAcademicYear] = useState(
    localStorage.getItem("academic_year") || "2025-2026"
  );

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line
  }, [departmentId, academicYear]);

  async function refreshAll() {
    setError("");
    setTeachers([]);
    setExcelInfo(null);
    setLoading(true);

    try {
      if (!departmentId || !academicYear) {
        throw new Error("Не найден department_id или academic_year");
      }

      const excelRes = await api.get("/excel/templates", {
        params: { department_id: departmentId },
      });

      const excelTemplates = Array.isArray(excelRes.data) ? excelRes.data : [];
      const currentExcel = excelTemplates.find(
        (t) => String(t.academic_year) === String(academicYear)
      );

      if (!currentExcel) {
        throw new Error(
          `Не найден Excel шаблон с нагрузкой для кафедры ${departmentId} и года ${academicYear}`
        );
      }

      setExcelInfo({
        excelTemplateId: currentExcel.id,
        sourceFilename: currentExcel.source_filename,
      });

      const res = await api.get("/form64/preview", {
        params: { excel_template_id: currentExcel.id },
      });

      if (res.data?.status === "ok") {
        setTeachers(res.data.teachers || []);
      } else {
        throw new Error(res.data?.detail || "Не удалось получить предпросмотр");
      }
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!excelInfo?.excelTemplateId) return;

    setDownloading(true);
    setError("");

    try {
      const res = await api.get("/form64/export", {
        params: { excel_template_id: excelInfo.excelTemplateId },
        responseType: "blob",
      });

      // The server may return a JSON error body even with a blob responseType.
      const contentType = res.data?.type || res.headers?.["content-type"] || "";
      if (contentType.includes("application/json")) {
        const text = await res.data.text();
        let detail = "Ошибка генерации";
        try {
          detail = JSON.parse(text).detail || detail;
        } catch {}
        throw new Error(detail);
      }

      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `form64_${academicYear}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      let detail = e?.message || "Ошибка скачивания";
      const data = e?.response?.data;
      if (data instanceof Blob) {
        try {
          detail = JSON.parse(await data.text()).detail || detail;
        } catch {}
      } else if (data?.detail) {
        detail = data.detail;
      }
      setError(detail);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="container"
      style={{ maxWidth: 1280, paddingTop: 28, paddingBottom: 40 }}
    >
      <div
        className="page-title"
        style={{
          fontSize: 52,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: "-0.03em",
          marginBottom: 24,
          color: "#17356f",
        }}
      >
        Форма 64
      </div>

      <div
        className="card card-pad"
        style={{
          borderRadius: 28,
          padding: 24,
          background: "rgba(255,255,255,0.94)",
          border: "1px solid rgba(30,58,138,0.08)",
          boxShadow: "0 16px 50px rgba(15, 23, 42, 0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
            alignItems: "flex-end",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={topLabelStyle}>Учебный год</div>
            <input
              value={academicYear}
              onChange={(e) => {
                setAcademicYear(e.target.value);
                localStorage.setItem("academic_year", e.target.value);
              }}
              style={yearInputStyle}
            />
          </div>

          <div
            className="small"
            style={{
              color: "#7c8aa5",
              fontWeight: 600,
              minHeight: 24,
              paddingBottom: 10,
            }}
          >
            {loading ? "Загрузка..." : ""}
          </div>
        </div>

        <div
          style={{
            borderRadius: 22,
            border: "1px solid #e4ebf7",
            background: "#fff",
            overflow: "hidden",
            marginBottom: 18,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr" }}>
            <InfoRow label="Кафедра ID" value={departmentId || "-"} />
            <InfoRow
              label="Excel с нагрузкой"
              value={excelInfo?.sourceFilename || "—"}
            />
          </div>
        </div>

        <div style={styles.note}>
          Колонки «План» заполняются автоматически из нагрузки. Колонки
          «Выполнение» остаются пустыми — кафедра заполняет фактические часы
          вручную.
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div className="section-title" style={styles.sectionTitle}>
          Преподаватели ({teachers.length})
        </div>

        <div
          style={{
            borderRadius: 20,
            border: "1px solid #e4ebf7",
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {teachers.length === 0 ? (
            <div style={styles.empty}>Нет данных</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>№</th>
                    <th style={{ ...styles.th, textAlign: "left" }}>ФИО</th>
                    <th style={styles.th}>1 сем. (план)</th>
                    <th style={styles.th}>2 сем. (план)</th>
                    <th style={styles.th}>Итого (план)</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t, i) => (
                    <tr key={`${t.teacher_name}-${i}`}>
                      <td style={styles.td}>{i + 1}</td>
                      <td style={{ ...styles.td, textAlign: "left" }}>
                        {t.teacher_name}
                      </td>
                      <td style={styles.td}>{fmt(t.sem1?.total)}</td>
                      <td style={styles.td}>{fmt(t.sem2?.total)}</td>
                      <td style={{ ...styles.td, fontWeight: 700 }}>
                        {fmt(t.year?.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <button
          className="btn btn-primary"
          onClick={handleDownload}
          disabled={downloading || !excelInfo?.excelTemplateId}
          style={styles.downloadButton}
        >
          {downloading ? "Формирование..." : "Сформировать и скачать DOCX"}
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <>
      <div
        style={{
          padding: "18px 20px",
          borderBottom: "1px solid #eef2ff",
          background: "#f8fbff",
          fontWeight: 700,
          color: "#5f7195",
        }}
      >
        {label}
      </div>
      <div
        style={{
          padding: "18px 20px",
          borderBottom: "1px solid #eef2ff",
          color: "#17356f",
          fontWeight: 600,
        }}
      >
        {value}
      </div>
    </>
  );
}

const styles = {
  sectionTitle: {
    marginTop: 26,
    marginBottom: 14,
    fontSize: 32,
    fontWeight: 800,
    color: "#17356f",
    letterSpacing: "-0.02em",
  },

  note: {
    marginBottom: 18,
    padding: "14px 16px",
    borderRadius: 16,
    background: "#eff6ff",
    color: "#1e40af",
    border: "1px solid #bfdbfe",
    fontWeight: 600,
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 15,
  },

  th: {
    padding: "12px 14px",
    background: "#f8fbff",
    color: "#5f7195",
    fontWeight: 700,
    textAlign: "center",
    borderBottom: "1px solid #e4ebf7",
    whiteSpace: "nowrap",
  },

  td: {
    padding: "12px 14px",
    color: "#17356f",
    textAlign: "center",
    borderBottom: "1px solid #eef2ff",
    whiteSpace: "nowrap",
  },

  downloadButton: {
    marginTop: 26,
    width: "100%",
    height: 58,
    borderRadius: 18,
    fontSize: 18,
    fontWeight: 800,
    boxShadow: "0 14px 32px rgba(58,110,255,0.25)",
  },

  errorBox: {
    marginBottom: 18,
    padding: "14px 16px",
    borderRadius: 16,
    background: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    fontWeight: 600,
  },

  empty: {
    padding: "28px",
    textAlign: "center",
    color: "#7c8aa5",
    fontWeight: 500,
  },
};
