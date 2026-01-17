import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { ArrowRight, Video } from "lucide-react";
import { loginTeacher } from "../lib/api.js";
import { setUser } from "../store/authSlice.js";

export default function Login() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setErrorMessage("");
    setLoading(true);
    loginTeacher({ username: username.trim(), password: password.trim() })
      .then(({ user }) => {
        dispatch(setUser(user));
        navigate("/dashboard");
      })
      .catch(() => {
        setErrorMessage("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <main className="min-h-screen px-6 py-12 text-ink-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-8 animate-fade-up">
        <header className="flex flex-col gap-4 text-center">
          <span className="inline-flex items-center justify-center gap-2 rounded-full border border-ink-900/10 bg-white/70 px-4 py-1 text-xs uppercase tracking-[0.3em] text-ink-700">
            <Video className="h-4 w-4" />
            Teacher Login
          </span>
          <h1 className="font-display text-3xl text-ink-900">เข้าสู่ระบบสำหรับครู</h1>
          <p className="text-sm text-ink-600">หน้านี้ใช้เฉพาะผู้สอนเท่านั้น</p>
        </header>

        <div className="glass-panel rounded-3xl p-8 soft-shadow">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="rounded-xl border border-ink-900/10 bg-white/80 px-4 py-3 text-ink-900 outline-none transition focus:border-sky-400"
              placeholder="ชื่อผู้ใช้"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-xl border border-ink-900/10 bg-white/80 px-4 py-3 text-ink-900 outline-none transition focus:border-sky-400"
              placeholder="รหัสผ่าน"
            />
            {errorMessage && <p className="text-xs text-rose-600">{errorMessage}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-6 py-3 font-semibold text-white shadow-lg shadow-sky-200/70 transition hover:-translate-y-0.5 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              เข้าสู่ระบบ
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
