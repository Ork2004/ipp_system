export function fmtDateTime(value) {
  if (!value) return "";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}
