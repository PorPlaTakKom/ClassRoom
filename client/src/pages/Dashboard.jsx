import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, PlusCircle, Video } from "lucide-react";
import { clearStoredUser } from "../lib/storage.js";
import { createRoom, fetchRooms } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";

export default function Dashboard({ user }) {
  const [rooms, setRooms] = useState([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRooms();
      setRooms(Array.isArray(data.rooms) ? data.rooms : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const socket = getSocket();
    const handleRoomRemoved = () => {
      reload();
    };
    socket.on("room-removed", handleRoomRemoved);
    return () => {
      socket.off("room-removed", handleRoomRemoved);
    };
  }, [reload]);

  const myRooms = useMemo(() => {
    const safeRooms = Array.isArray(rooms) ? rooms : [];
    if (user.role === "Teacher") {
      return safeRooms.filter((room) => room.teacherName === user.name);
    }
    return safeRooms;
  }, [rooms, user]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    await createRoom({ title: title.trim(), teacherName: user.name });
    setTitle("");
    reload();
  };

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 animate-fade-up">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-ink-500">Dashboard</p>
            <h1 className="font-display text-3xl text-ink-900 md:text-4xl">
              สวัสดี {user.name}
            </h1>
            <p className="text-ink-600">
              {user.role === "Teacher"
                ? "จัดการห้องเรียนและอนุมัตินักเรียนที่จะเข้าร่วม"
                : "เลือกห้องเรียนที่ต้องการเข้าดู Live"}
            </p>
          </div>
          <button
            className="rounded-full border border-ink-900/20 bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.2em] text-ink-700 transition hover:border-ink-900/40"
            onClick={() => {
              clearStoredUser();
              window.location.href = "/";
            }}
          >
            ออกจากระบบ
          </button>
        </header>

        {user.role === "Teacher" && (
          <form
            onSubmit={handleCreate}
            className="glass-panel flex flex-col gap-4 rounded-3xl p-6 soft-shadow md:flex-row md:items-end"
          >
            <div className="flex-1">
              <label className="text-xs uppercase tracking-[0.2em] text-ink-600">
                สร้างห้องเรียนใหม่
              </label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-ink-900/10 bg-white/70 px-4 py-3 text-ink-900 outline-none transition focus:border-sky-400"
                placeholder="เช่น Math Live Session"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 py-3 font-semibold text-white shadow-lg shadow-sky-200/70 transition hover:-translate-y-0.5 hover:bg-sky-400"
            >
              <PlusCircle className="h-4 w-4" />
              เพิ่มห้องเรียน
            </button>
          </form>
        )}

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <Video className="h-5 w-5 text-sky-300" />
              <h2 className="font-display text-2xl text-ink-900">
                {user.role === "Teacher" ? "ห้องเรียนของฉัน" : "ห้องเรียนทั้งหมด"}
              </h2>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {loading ? (
                <div className="rounded-2xl border border-ink-900/10 bg-white/70 p-6 text-ink-600">
                  กำลังโหลดข้อมูลห้องเรียน...
                </div>
              ) : myRooms.length === 0 ? (
                <div className="rounded-2xl border border-ink-900/10 bg-white/70 p-6 text-ink-600">
                  {user.role === "Teacher"
                    ? "คุณยังไม่มีห้องเรียนที่สร้างไว้"
                    : "ยังไม่มีห้องเรียนที่เปิดให้เข้าร่วม"}
                </div>
              ) : (
                myRooms.map((room) => (
                  <div
                    key={room.id}
                    className="glass-panel flex flex-col justify-between gap-6 rounded-3xl p-6 soft-shadow transition duration-300 hover:-translate-y-1"
                  >
                    <div>
                      <h3 className="font-display text-xl text-ink-900">{room.title}</h3>
                      <p className="text-sm text-ink-600">โดย {room.teacherName}</p>
                    </div>
                    <div className="flex items-center justify-between text-xs text-ink-600">
                      <span className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4" />
                        สร้างเมื่อ {new Date(room.createdAt).toLocaleDateString("th-TH")}
                      </span>
                      <Link
                        to={`/classroom/${room.id}`}
                        className="rounded-full border border-ink-900/20 bg-white/70 px-3 py-1 text-xs text-ink-700 transition hover:border-ink-900/40"
                      >
                        เข้าห้อง
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <aside className="glass-panel rounded-3xl p-6 soft-shadow">
            <h3 className="font-display text-xl text-ink-900">สถานะระบบ Live</h3>
            <p className="mt-2 text-sm text-ink-600">
              ระบบ Live เชื่อมต่อผ่าน Socket.io และพร้อมใช้งานแบบเรียลไทม์
            </p>
            <div className="mt-6 rounded-2xl border border-ink-900/10 bg-white/70 p-4 text-sm text-ink-600">
              เปิด Classroom เพื่อเริ่มรับคำขอเข้าห้อง และเริ่มต้นการแชทได้ทันที
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
