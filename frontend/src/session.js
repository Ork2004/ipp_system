export const SESSION_KEYS = [
  "token",
  "role",
  "teacher_id",
  "department_id",
  "excel_template_id",
  "docx_template_id",
  "raw_template_id",
  "academic_year",
];

export function getToken() {
  return localStorage.getItem("token");
}

export function getRole() {
  return localStorage.getItem("role") || "guest";
}

export function getRoleLabel(role = getRole()) {
  if (role === "admin") return "Админ";
  if (role === "teacher") return "Преподаватель";
  return "Гость";
}

export function clearSession() {
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}
