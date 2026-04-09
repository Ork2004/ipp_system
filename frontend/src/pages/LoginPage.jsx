import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import "./styles/LoginPage.css";

function parseJwt(token) {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
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

      if (payload.teacher_id) {
        localStorage.setItem("teacher_id", String(payload.teacher_id));
      }

      if (payload.department_id) {
        localStorage.setItem("department_id", String(payload.department_id));
      }

      if (role === "admin") nav("/settings");
      else nav("/generate");
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || "Ошибка входа";
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="bg-orb orb-1" />
      <div className="bg-orb orb-2" />
      <div className="bg-grid" />

      <div className="login-shell">
        <div className="login-card-wrap">
          <div className="login-card">
            <div className="login-card-top">
              <div className="login-logo">IPP</div>
              <div>
                <div className="login-title">Вход</div>
                <div className="login-subtitle">Введите логин и пароль</div>
              </div>
            </div>

            <form onSubmit={onSubmit} className="login-form">
              <div className="field-block">
                <label className="field-label">Логин</label>
                <div className="input-wrap">
                  <input
                    className="input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Введите логин"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="field-block">
                <label className="field-label">Пароль</label>
                <div className="input-wrap">
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>

              {error ? <div className="login-error">{error}</div> : null}

              <button className="login-btn" type="submit" disabled={loading}>
                {loading ? "Вход..." : "Войти"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}