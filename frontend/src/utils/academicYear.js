export function getAutoAcademicYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export function normalizeAcademicYear(value) {
  const clean = String(value || "").trim();
  return clean || getAutoAcademicYear();
}

export function getStoredAcademicYear() {
  return normalizeAcademicYear(localStorage.getItem("academic_year"));
}
