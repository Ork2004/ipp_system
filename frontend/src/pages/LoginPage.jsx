import { useState} from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import "./styles/LoginPage.css";

function parseJwt(token) {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded;
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/auth/login", { username, password });

      const token = res.data?.access_token;
      if (!token) throw new Error("Нет access_token в ответе бекенда");

      localStorage.setItem("token", token);

      const payload = parseJwt(token) || {};
      const role = payload.role || "guest";
      localStorage.setItem("role", role);

      if (payload.teacher_id) localStorage.setItem("teacher_id", String(payload.teacher_id));
      if (payload.department_id) localStorage.setItem("department_id", String(payload.department_id));

      if (role === "admin") nav("/settings");
      else nav("/generate");
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Ошибка входа";
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-center">
        <div className="card login-card">
          <div className="card-pad">
            <div className="login-header">
              <div className="login-logo">IPP</div>
              <div className="login-headtext">
                <div className="login-title">Вход</div>
                <div className="small">Введите логин и пароль, чтобы продолжить работу.</div>
              </div>
            </div>

            <div className="hr" />

            <form onSubmit={onSubmit} className="login-form">
              <div className="login-field">
                <div className="login-label">Логин</div>
                <input
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="например: dept_admin / teacher1 / guest"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="login-field">
                <div className="login-label">Пароль</div>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>

              {error ? <div className="login-error">{error}</div> : null}

              <div className="actions-row login-actions">
                <div className="small">Роль определится автоматически (admin/teacher/guest).</div>
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? "Входим..." : "Войти"}
                </button>
              </div>
            </form>

          </div>
        </div>
      </div>
    </div>
  );
}
