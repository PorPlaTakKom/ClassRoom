import { ArrowRight, Layers, MonitorPlay, Sparkles, Video } from "lucide-react";
import { Link } from "react-router-dom";

const features = [
  {
    title: "Live Classroom",
    detail: "สอนสดพร้อมแชร์หน้าจอและแชทได้ในหน้าจอเดียว",
    icon: Video
  },
  {
    title: "Approval Flow",
    detail: "อนุมัตินักเรียนก่อนเข้าห้องเพื่อคุมคุณภาพคลาส",
    icon: Layers
  },
  {
    title: "File Drop",
    detail: "อัปโหลดไฟล์ประกอบการสอนให้นักเรียนดาวน์โหลดทันที",
    icon: MonitorPlay
  },
  {
    title: "Realtime Focus",
    detail: "ดีไซน์เพื่อความลื่นไหลและประสบการณ์ที่ดูแพง",
    icon: Sparkles
  }
];

export default function Landing() {
  return (
    <main className="min-h-screen px-6 py-12 text-ink-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 animate-fade-up">
        <header className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ink-900/10 bg-white/70 px-4 py-1 text-xs uppercase tracking-[0.3em] text-ink-700">
            <Video className="h-4 w-4" />
            TARKOM LIVE
          </span>
          <h1 className="font-display text-4xl font-semibold leading-tight text-ink-900 md:text-6xl">
            ห้องเรียนออนไลน์ที่ดู <span className="text-sky-500">เรียบหรู</span> และลื่นไหลเหมือน
          </h1>
          <p className="max-w-2xl text-lg text-ink-600">
            สร้างคลาสสดแบบพรีเมียม แชร์หน้าจอ ส่งไฟล์ และคุมผู้เข้าร่วมได้ในอินเทอร์เฟซเดียว.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
            >
              เข้าสู่ระบบครู
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-sm text-ink-500">เวอร์ชันสำหรับผู้สอน</span>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          {features.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="glass-panel rounded-3xl p-6 soft-shadow transition duration-300 hover:-translate-y-1"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-sky-200/70 p-3">
                    <Icon className="h-5 w-5 text-sky-700" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl text-ink-900">{item.title}</h3>
                    <p className="mt-2 text-sm text-ink-600">{item.detail}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[32px] border border-ink-900/10 bg-white/80 p-8 shadow-[0_30px_80px_rgba(15,32,66,0.15)]">
            <h2 className="font-display text-2xl text-ink-900">Studio Mode</h2>
            <p className="mt-2 text-sm text-ink-600">
              โหมดสำหรับครูที่ต้องการโฟกัสเต็มที่ ตั้งแต่เสียง ภาพ จนถึงเอกสารประกอบการสอน.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "ควบคุมผู้เรียนได้แบบเรียลไทม์",
                "คุณภาพวิดีโอระดับ 1080p",
                "แชร์ไฟล์และลิงก์ได้ทันที",
                "อินเทอร์เฟซดูสะอาดตา"
              ].map((label) => (
                <div
                  key={label}
                  className="rounded-2xl border border-ink-900/10 bg-white/70 px-4 py-3 text-sm text-ink-700"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-8 soft-shadow animate-float-in">
            <h2 className="font-display text-2xl text-ink-900">เริ่มต้นได้ทันที</h2>
            <p className="mt-2 text-sm text-ink-600">
              เข้าสู่ระบบด้วยบัญชีครู แล้วสร้างห้องเรียนภายในไม่กี่คลิก.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-200/70 transition hover:-translate-y-0.5 hover:bg-sky-400"
            >
              ไปที่หน้าเข้าสู่ระบบ
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <footer className="text-xs text-ink-500">© 2026 tarkom</footer>
      </div>
    </main>
  );
}
