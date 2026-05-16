import { useEffect, useMemo, useRef, useState } from "react";
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

export default function Form63Page() {
  const role = localStorage.getItem("role") || "guest";
  const isAdmin = role === "admin";

  const [excelInfo, setExcelInfo] = useState(null);
  const [form63Templates, setForm63Templates] = useState([]);
  const [selectedTplId, setSelectedTplId] = useState(null);
  const [iupStatus, setIupStatus] = useState(null);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [uploadFile, setUploadFile] = useState(null);
  const fileInputRef = useRef(null);

  const departmentId = localStorage.getItem("department_id");
  const [academicYear, setAcademicYear] = useState(
    localStorage.getItem("academic_year") || "2025-2026"
  );

  const selectedTpl = useMemo(() => {
    return (
      form63Templates.find((t) => t.id === selectedTplId) || null
    );
  }, [form63Templates, selectedTplId]);

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line
  }, [departmentId, academicYear]);

  async function refreshAll() {
    setError("");
    setLoading(true);

    try {
      if (!departmentId || !academicYear) {
        throw new Error(
          "Не найден department_id или academic_year"
        );
      }

      const excelRes = await api.get("/excel/templates", {
        params: { department_id: departmentId },
      });

      const excelTemplates = Array.isArray(excelRes.data)
        ? excelRes.data
        : [];

      const currentExcel = excelTemplates.find(
        (t) =>
          String(t.academic_year) === String(academicYear)
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

      const tplRes = await api.get("/form63/templates", {
        params: { department_id: departmentId },
      });

      const tpls = Array.isArray(tplRes.data)
        ? tplRes.data
        : [];

      setForm63Templates(tpls);

      const currentTpl = tpls.find(
        (t) =>
          String(t.academic_year) === String(academicYear)
      );

      setSelectedTplId(
        currentTpl ? currentTpl.id : tpls[0]?.id ?? null
      );

      if (isAdmin && currentExcel?.id) {
        try {
          const iupRes = await api.get(
            `/form63/iup-status?excel_template_id=${currentExcel.id}`
          );

          if (iupRes.data?.status === "ok") {
            setIupStatus(iupRes.data);
          } else {
            setIupStatus(null);
          }
        } catch {
          setIupStatus(null);
        }
      }
    } catch (e) {
      setError(
        e?.response?.data?.detail ||
          e.message ||
          "Ошибка загрузки"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (!uploadFile) return;

    setUploading(true);
    setError("");
    setInfo("");

    try {
      const formData = new FormData();

      formData.append("department_id", departmentId);
      formData.append("academic_year", academicYear);
      formData.append("file", uploadFile);

      const res = await api.post(
        "/form63/templates",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setInfo(
        `Шаблон "${res.data.source_filename}" загружен`
      );

      setUploadFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await refreshAll();

      setSelectedTplId(res.data.id);
    } catch (e) {
      setError(
        e?.response?.data?.detail ||
          e.message ||
          "Ошибка загрузки"
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    const ok = window.confirm(
      "Удалить шаблон формы 63?"
    );

    if (!ok) return;

    try {
      await api.delete(`/form63/templates/${id}`);

      setInfo("Шаблон удалён");

      await refreshAll();
    } catch (e) {
      setError(
        e?.response?.data?.detail ||
          e.message ||
          "Ошибка удаления"
      );
    }
  }

  async function handleDownload() {
    if (!excelInfo?.excelTemplateId || !selectedTplId)
      return;

    setDownloading(true);
    setError("");

    try {
      const res = await api.get(
        `/form63/export-template?excel_template_id=${excelInfo.excelTemplateId}&form63_template_id=${selectedTplId}`,
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
      a.download = `form63_${academicYear}.xlsx`;

      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(
        e?.response?.data?.detail ||
          "Ошибка скачивания"
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="container"
      style={{
        maxWidth: 1280,
        paddingTop: 28,
        paddingBottom: 40,
      }}
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
        Форма 63
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
            <div style={topLabelStyle}>
              Учебный год
            </div>

            <input
              value={academicYear}
              onChange={(e) => {
                setAcademicYear(e.target.value);

                localStorage.setItem(
                  "academic_year",
                  e.target.value
                );
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "260px 1fr",
            }}
          >
            <InfoRow
              label="Кафедра ID"
              value={departmentId || "-"}
            />

            <InfoRow
              label="Excel с нагрузкой"
              value={
                excelInfo?.sourceFilename || "—"
              }
            />
          </div>
        </div>

        {info && (
          <div style={styles.successBox}>
            {info}
          </div>
        )}

        {error && (
          <div style={styles.errorBox}>
            {error}
          </div>
        )}

        {iupStatus && (
          <div style={styles.iupBox}>
            <div style={styles.iupTop}>
              <strong>
                Статус заполнения ИУП
              </strong>

              <span style={styles.iupCounter}>
                {iupStatus.teachers_with_iup} из{" "}
                {iupStatus.total_teachers}
              </span>
            </div>

            <p style={styles.iupText}>
              Категории K–R берутся из ИУП.
            </p>

            <div style={styles.iupList}>
              {iupStatus.teachers?.map((t) => (
                <div
                  key={t.teacher_name}
                  style={styles.iupRow}
                >
                  <span
                    style={{
                      ...styles.iupBadge,
                      background: t.iup_filled
                        ? "#dcfce7"
                        : "#fef3c7",
                      color: t.iup_filled
                        ? "#166534"
                        : "#92400e",
                    }}
                  >
                    {t.iup_filled
                      ? "ИУП"
                      : "Excel"}
                  </span>

                  <span>{t.teacher_name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isAdmin && (
          <>
            <div
              className="section-title"
              style={styles.sectionTitle}
            >
              Загрузить шаблон
            </div>

            <div style={styles.uploadBox}>
  <input
    ref={fileInputRef}
    type="file"
    accept=".xlsx,.xls"
    id="form63-file"
    style={{ display: "none" }}
    onChange={(e) =>
      setUploadFile(
        e.target.files?.[0] || null
      )
    }
  />

  <button
    className="btn btn-primary"
    onClick={() =>
      document
        .getElementById("form63-file")
        .click()
    }
    style={styles.bigButton}
  >
    Выбрать файл
  </button>

  <div style={styles.fileName}>
    {uploadFile
      ? `Файл: ${uploadFile.name}`
      : "Файл не выбран"}
  </div>
</div>

<div
  className="actions-row"
  style={{
    marginBottom: 20,
  }}
>
  <button
    className="btn btn-primary"
    onClick={handleUpload}
    disabled={
      uploading || !uploadFile
    }
    style={{
      minWidth: 150,
      height: 46,
      borderRadius: 14,
      fontWeight: 700,
      boxShadow:
        "0 12px 24px rgba(58,110,255,0.18)",
    }}
  >
    {uploading
      ? "Загрузка..."
      : "Загрузить"}
  </button>
</div>
          </>
        )}

        <div
          className="section-title"
          style={styles.sectionTitle}
        >
          Загруженные шаблоны
        </div>

        <div
          style={{
            borderRadius: 20,
            border: "1px solid #e4ebf7",
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {form63Templates.length === 0 ? (
            <div style={styles.empty}>
              Шаблон не найден
            </div>
          ) : (
            form63Templates.map((t) => (
              <label
                key={t.id}
                style={{
                  ...styles.templateRow,
                  borderBottom:
                    t.id !==
                    form63Templates[
                      form63Templates.length - 1
                    ]?.id
                      ? "1px solid #eef2ff"
                      : "none",
                }}
              >
                <input
                  type="radio"
                  checked={selectedTplId === t.id}
                  onChange={() =>
                    setSelectedTplId(t.id)
                  }
                />

                <div style={{ flex: 1 }}>
                  <div style={styles.templateTop}>
                    <strong
                      style={{
                        color: "#17356f",
                      }}
                    >
                      {t.source_filename}
                    </strong>

                    <span style={styles.yearBadge}>
                      {t.academic_year}
                    </span>
                  </div>

                  <div style={styles.templateMeta}>
                    Строка:{" "}
                    <b>{t.data_start_row}</b> ·
                    колонок:{" "}
                    <b>
                      {
                        Object.keys(
                          t.column_mapping || {}
                        ).length
                      }
                    </b>
                  </div>
                </div>

                {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(t.id);
                    }}
                    style={styles.deleteButton}
                  >
                    Удалить
                  </button>
                )}
              </label>
            ))
          )}
        </div>

        {isAdmin && selectedTpl && (
          <>
            <div
              className="section-title"
              style={styles.sectionTitle}
            >
              Маппинг колонок
            </div>

            <div style={styles.mappingGrid}>
              {CATEGORY_ORDER.map((cat) => (
                <div
                  key={cat}
                  style={styles.mappingCard}
                >
                  <div style={styles.mappingLabel}>
                    {CATEGORY_LABELS[cat]}
                  </div>

                  <div style={styles.mappingValue}>
                    {selectedTpl.column_mapping?.[
                      cat
                    ] ? (
                      <code style={styles.code}>
                        {
                          selectedTpl.column_mapping[
                            cat
                          ]
                        }
                      </code>
                    ) : (
                      <span
                        style={{
                          color: "#b91c1c",
                        }}
                      >
                        не найдено
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <button
          className="btn btn-primary"
          onClick={handleDownload}
          disabled={
            downloading ||
            !excelInfo?.excelTemplateId ||
            !selectedTplId
          }
          style={styles.downloadButton}
        >
          {downloading
            ? "Формирование..."
            : "Сформировать и скачать"}
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

  uploadBox: {
    borderRadius: 24,
    border: "2px dashed #b8cdfd",
    background:
      "linear-gradient(180deg, rgba(58,110,255,0.07) 0%, rgba(58,110,255,0.03) 100%)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    padding: "28px 20px",
    marginBottom: 18,
  },

  bigButton: {
    minWidth: 170,
    height: 50,
    borderRadius: 14,
    fontWeight: 700,
    fontSize: 16,
    boxShadow:
      "0 12px 28px rgba(58,110,255,0.22)",
  },

  uploadButton: {
    marginTop: 16,
    minWidth: 170,
    height: 48,
    borderRadius: 14,
    fontWeight: 700,
  },

  fileName: {
    marginTop: 14,
    fontSize: 15,
    color: "#17356f",
    fontWeight: 600,
  },

  templateRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "18px",
    background: "#fff",
  },

  templateTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  templateMeta: {
    marginTop: 6,
    fontSize: 14,
    color: "#6b7280",
  },

  yearBadge: {
    background: "#eef2ff",
    color: "#315fcb",
    padding: "5px 10px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
  },

  deleteButton: {
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#b91c1c",
    padding: "10px 14px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 700,
  },

  mappingGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 14,
  },

  mappingCard: {
    border: "1px solid #e4ebf7",
    borderRadius: 18,
    padding: 16,
    background: "#fbfdff",
  },

  mappingLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#5f7195",
    marginBottom: 10,
  },

  mappingValue: {
    color: "#17356f",
    fontWeight: 700,
  },

  code: {
    background: "#eef2ff",
    color: "#3730a3",
    padding: "4px 8px",
    borderRadius: 8,
    fontFamily: "monospace",
    fontSize: 13,
  },

  downloadButton: {
    marginTop: 26,
    width: "100%",
    height: 58,
    borderRadius: 18,
    fontSize: 18,
    fontWeight: 800,
    boxShadow:
      "0 14px 32px rgba(58,110,255,0.25)",
  },

  successBox: {
    marginBottom: 18,
    padding: "14px 16px",
    borderRadius: 16,
    background: "#ecfdf5",
    color: "#047857",
    border: "1px solid #a7f3d0",
    fontWeight: 600,
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

  iupBox: {
    marginBottom: 20,
    padding: "18px",
    border: "1px solid #c7d2fe",
    background: "#eef2ff",
    borderRadius: 20,
  },

  iupTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    color: "#17356f",
  },

  iupCounter: {
    background: "#17356f",
    color: "#fff",
    padding: "6px 12px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 13,
  },

  iupText: {
    color: "#556987",
    marginBottom: 14,
  },

  iupList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  iupRow: {
    background: "#fff",
    borderRadius: 12,
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  iupBadge: {
    padding: "4px 10px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 12,
  },
};