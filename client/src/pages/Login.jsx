import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, Users, Video } from "lucide-react";
import { storeUser } from "../lib/storage.js";

const mockUsers = {
  Teacher: [{ name: "Teacher A" }, { name: "Teacher B" }],
  Student: [{ name: "Student One" }, { name: "Student Two" }]
};

export default function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState("Teacher");
  const [name, setName] = useState(mockUsers.Teacher[0].name);

  const handleRoleChange = (nextRole) => {
    setRole(nextRole);
    setName(mockUsers[nextRole][0].name);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    storeUser({ name: name.trim(), role });
    navigate("/dashboard");
  };

  return (
    <main className="min-h-screen px-6 py-12 text-ink-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 animate-fade-up">
        <header className="flex flex-col gap-4">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ink-900/10 bg-white/70 px-4 py-1 text-xs uppercase tracking-[0.3em] text-ink-700">
            <Video className="h-4 w-4" />
            Live Learning
          </span>
          <h1 className="font-display text-4xl font-semibold leading-tight text-ink-900 md:text-6xl">
            ห้องเรียนออนไลน์ที่ <span className="text-sky-400">สด</span> และโต้ตอบได้ทันที
          </h1>
          <p className="max-w-2xl text-lg text-ink-600">
            แพลตฟอร์มเรียนสดที่ให้ครูถ่ายทอดสด นักเรียนขอเข้าห้อง และแชทแบบเรียลไทม์ในจุดเดียว.
          </p>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div className="glass-panel rounded-3xl p-8 soft-shadow animate-float-in">
            <h2 className="font-display text-2xl text-ink-900">เลือกบทบาทเพื่อเริ่มใช้งาน</h2>
            <p className="mt-2 text-sm text-ink-600">
              ใช้ mock user เพื่อทดลองระบบได้ทันที ไม่ต้องสมัครจริง
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => handleRoleChange("Teacher")}
                className={`flex flex-col gap-4 rounded-2xl border px-5 py-6 text-left transition duration-300 hover:-translate-y-1 ${
                  role === "Teacher"
                    ? "border-sky-400 bg-white/70"
                    : "border-ink-900/10 bg-white/60 hover:border-ink-900/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-sky-200/60 p-3">
                    <GraduationCap className="h-5 w-5 text-sky-700" />
                  </div>
                  <h3 className="font-display text-lg text-ink-900">Teacher</h3>
                </div>
                <p className="text-sm text-ink-600">
                  สร้างห้องเรียนและอนุมัตินักเรียนที่ขอเข้าห้อง
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleRoleChange("Student")}
                className={`flex flex-col gap-4 rounded-2xl border px-5 py-6 text-left transition duration-300 hover:-translate-y-1 ${
                  role === "Student"
                    ? "border-sky-400 bg-white/70"
                    : "border-ink-900/10 bg-white/60 hover:border-ink-900/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-sky-200/60 p-3">
                    <Users className="h-5 w-5 text-sky-700" />
                  </div>
                  <h3 className="font-display text-lg text-ink-900">Student</h3>
                </div>
                <p className="text-sm text-ink-600">
                  ส่งคำขอเข้าห้องและแชทกับผู้สอนแบบเรียลไทม์
                </p>
              </button>
            </div>

            <form className="mt-8 grid gap-4" onSubmit={handleSubmit}>
              <label className="text-sm text-ink-700">ชื่อที่ใช้ในห้องเรียน</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-xl border border-ink-900/10 bg-white/70 px-4 py-3 text-ink-900 outline-none transition focus:border-sky-400"
                placeholder="กรอกชื่อของคุณ"
              />

              <div className="flex flex-wrap gap-2">
                {mockUsers[role].map((user) => (
                  <button
                    key={user.name}
                    type="button"
                    onClick={() => setName(user.name)}
                    className="rounded-full border border-ink-900/10 bg-white/60 px-4 py-1 text-xs text-ink-700 transition hover:border-ink-900/30"
                  >
                    {user.name}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-sky-500 px-6 py-3 font-semibold text-white shadow-lg shadow-sky-200/70 transition hover:-translate-y-0.5 hover:bg-sky-400"
              >
                เข้าสู่ระบบแบบ {role}
              </button>
            </form>
          </div>

          <div className="flex flex-col gap-6">
            <div className="glass-panel rounded-3xl p-6 soft-shadow animate-float-in">
              <h3 className="font-display text-xl text-ink-900">สิ่งที่ได้ในเดโมนี้</h3>
              <ul className="mt-4 space-y-3 text-sm text-ink-600">
                <li>ห้องเรียนแบบ Live พร้อมวิดีโอและแชท</li>
                <li>ระบบขออนุมัติเข้าห้องสำหรับนักเรียน</li>
                <li>Dashboard แยกตามบทบาทผู้ใช้</li>
              </ul>
            </div>
            <div className="rounded-3xl bg-white/70 p-6 text-sm text-ink-600 shadow-sm">
              <p className="font-display text-lg text-ink-900">Tips</p>
              <p className="mt-2">
                เปิด 2 browser เพื่อทดสอบ Teacher และ Student พร้อมกัน แล้วดูการอนุมัติผ่าน Socket.io.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
