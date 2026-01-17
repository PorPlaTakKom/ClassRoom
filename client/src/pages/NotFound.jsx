import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="glass-panel mx-auto max-w-3xl rounded-3xl p-10 text-center soft-shadow animate-fade-up">
        <h1 className="font-display text-3xl text-ink-900">ไม่พบหน้านี้</h1>
        <p className="mt-3 text-ink-600">ลองกลับไปที่หน้า Dashboard เพื่อเริ่มต้นใหม่</p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex rounded-full border border-ink-900/20 bg-white/70 px-5 py-2 text-sm text-ink-700"
        >
          กลับไปหน้า Dashboard
        </Link>
      </div>
    </main>
  );
}
