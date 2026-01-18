import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Maximize2,
  Mic,
  MicOff,
  MessageCircle,
  Send,
  Users2,
  Video
} from "lucide-react";
import { Room, RoomEvent, Track, createLocalScreenTracks } from "livekit-client";
import {
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  useTracks
} from "@livekit/components-react";
import {
  deleteRoomFile,
  fetchLivekitToken,
  fetchRoom,
  fetchRoomFiles,
  getApiBase,
  uploadRoomFile
} from "../lib/api.js";
import { getSocket } from "../lib/socket.js";
import { useDispatch, useSelector } from "react-redux";
import { setUser } from "../store/authSlice.js";

const getParticipantName = (participant) =>
  participant?.name || participant?.identity || "";

const normalizeName = (name) => (name ? name.trim().toLowerCase() : "");

const getTrackSource = (trackRef) =>
  trackRef?.source ?? trackRef?.publication?.source;

const isTeacherTrack = (trackRef) =>
  trackRef?.participant?.metadata === "Teacher";

const isStudentTrack = (trackRef) =>
  trackRef?.participant?.metadata === "Student";

const getTrackKey = (trackRef) => {
  const participantId = trackRef?.participant?.sid || "participant";
  const trackId =
    trackRef?.publication?.trackSid ||
    trackRef?.publication?.sid ||
    getTrackSource(trackRef) ||
    "track";
  return `${participantId}-${trackId}`;
};

function LiveKitTeacherStream({ onStreamChange, className }) {
  const tracks = useTracks([Track.Source.ScreenShare, Track.Source.Camera], {
    onlySubscribed: true
  });
  const teacherTracks = tracks.filter(isTeacherTrack);
  const screenTrack = teacherTracks.find(
    (track) => getTrackSource(track) === Track.Source.ScreenShare
  );
  const cameraTrack = teacherTracks.find(
    (track) => getTrackSource(track) === Track.Source.Camera
  );
  const activeTrack = screenTrack || cameraTrack;

  useEffect(() => {
    onStreamChange?.(Boolean(activeTrack));
  }, [activeTrack, onStreamChange]);

  if (!activeTrack) return null;

  return <VideoTrack trackRef={activeTrack} className={className} />;
}

function LiveKitStudentCameraSection() {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const studentTracks = tracks.filter(
    (track) =>
      isStudentTrack(track) && getTrackSource(track) === Track.Source.Camera
  );

  if (studentTracks.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-ink-900/10 bg-white/70 p-4">
      <p className="text-xs font-semibold text-ink-600">กล้องนักเรียน</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {studentTracks.map((trackRef) => (
          <div key={getTrackKey(trackRef)} className="relative">
            <VideoTrack
              trackRef={trackRef}
              className="h-24 w-full rounded-xl object-cover"
            />
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white">
              {getParticipantName(trackRef.participant) || "Student"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Classroom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const joinMode = new URLSearchParams(location.search).get("join") === "1";
  const dispatch = useDispatch();
  const storedUser = useSelector((state) => state.auth.user);
  const localVideoRef = useRef(null);
  const liveKitRoomRef = useRef(null);
  const liveVideoContainerRef = useRef(null);
  const [liveKitRoom, setLiveKitRoom] = useState(null);
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(storedUser);
  const [approved, setApproved] = useState(currentUser?.role === "Teacher");
  const [pending, setPending] = useState([]);
  const [approvedList, setApprovedList] = useState([]);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canShareScreen, setCanShareScreen] = useState(true);
  const audioCtxRef = useRef(null);
  const [classClosed, setClassClosed] = useState(false);
  const [networkStatus, setNetworkStatus] = useState(() =>
    typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline"
  );
  const [connectionType, setConnectionType] = useState("unknown");
  const [saveData, setSaveData] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micError, setMicError] = useState("");
  const [needsMediaAccess, setNeedsMediaAccess] = useState(false);
  const [speakingMap, setSpeakingMap] = useState({});
  const [isSpeaking, setIsSpeaking] = useState(false);
  const chatEndRef = useRef(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const localCameraRef = useRef(null);
  const screenTracksRef = useRef([]);
  const [needsJoinProfile, setNeedsJoinProfile] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    let active = true;
    const loadRoom = async () => {
      setLoading(true);
      try {
        const data = await fetchRoom(roomId);
        if (active) {
          setRoom(data.room);
        }
      } catch (error) {
        if (active) {
          setRoom(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    loadRoom();
    return () => {
      active = false;
    };
  }, [roomId]);

  useEffect(() => {
    if (!room || !currentUser || needsJoinProfile) return;
    if (currentUser.role !== "Student") {
      setNeedsMediaAccess(false);
      return;
    }
    if (!navigator.permissions?.query) {
      setNeedsMediaAccess(true);
      return;
    }
    const checkPermissions = async () => {
      try {
        const [mic, cam] = await Promise.all([
          navigator.permissions.query({ name: "microphone" }),
          navigator.permissions.query({ name: "camera" })
        ]);
        const granted = mic.state === "granted" && cam.state === "granted";
        setNeedsMediaAccess(!granted);
      } catch (error) {
        setNeedsMediaAccess(true);
      }
    };
    checkPermissions();
  }, [room, currentUser, needsJoinProfile]);

  const requestMediaPermissions = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((track) => track.stop());
      setNeedsMediaAccess(false);
    } catch (error) {
      setNeedsMediaAccess(true);
    }
  };

  useEffect(() => {
    let active = true;
    const loadFiles = async () => {
      if (!roomId) return;
      try {
        const data = await fetchRoomFiles(roomId);
        if (active) setFiles(data.files);
      } catch (error) {
        if (active) setFiles([]);
      }
    };
    loadFiles();
    return () => {
      active = false;
    };
  }, [roomId]);

  useEffect(() => {
    setCurrentUser(storedUser);
  }, [storedUser]);

  useEffect(() => {
    setApproved(currentUser?.role === "Teacher");
    if (joinMode && (!currentUser || currentUser.role !== "Student")) {
      setNeedsJoinProfile(true);
      setJoinName(currentUser?.name || "");
    } else {
      setNeedsJoinProfile(false);
    }
  }, [currentUser, joinMode]);

  useEffect(() => {
    if (!room || !currentUser || needsJoinProfile) return;
    const socket = getSocket();

    const handleConnect = () => {
      if (currentUser.role === "Teacher") {
        socket.emit("join-room", {
          roomId,
          user: currentUser
        });
      } else {
        socket.emit("request-join", {
          roomId,
          user: currentUser
        });
      }
    };

    const handleDisconnect = () => {};

    const handleJoinRequest = (payload) => {
      setPending(payload.pending);
    };

    const handlePendingNotify = (payload) => {
      setPending(payload.pending);
    };

    const handleApprovedList = (payload) => {
      setApprovedList(payload.approved || []);
    };

    const handleStudentApproved = (payload) => {
      setApprovedList((prev) => {
        if (!payload?.socketId) return prev;
        if (prev.some((entry) => entry.socketId === payload.socketId)) return prev;
        return [...prev, { socketId: payload.socketId, user: payload.user }];
      });
    };

    const handleChatHistory = (payload) => {
      setMessages(payload.messages);
    };

    const handleChatMessage = (payload) => {
      setMessages((prev) => [...prev, payload]);
    };

    const handleJoinApproved = () => {
      setApproved(true);
    };

    const handleClassClosed = () => {
      setClassClosed(true);
      setApproved(false);
      setSpeakingMap({});
      setMicEnabled(false);
      setCameraEnabled(false);
      setHasRemoteStream(false);
      liveKitRoomRef.current?.disconnect();
      liveKitRoomRef.current = null;
      setLiveKitRoom(null);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("pending-list", handleJoinRequest);
    socket.on("join-request", handlePendingNotify);
    socket.on("chat-history", handleChatHistory);
    socket.on("chat-message", handleChatMessage);
    socket.on("join-approved", handleJoinApproved);
    socket.on("approved-list", handleApprovedList);
    socket.on("student-approved", handleStudentApproved);
    socket.on("class-closed", handleClassClosed);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("pending-list", handleJoinRequest);
      socket.off("join-request", handlePendingNotify);
      socket.off("chat-history", handleChatHistory);
      socket.off("chat-message", handleChatMessage);
      socket.off("join-approved", handleJoinApproved);
      socket.off("approved-list", handleApprovedList);
      socket.off("student-approved", handleStudentApproved);
      socket.off("class-closed", handleClassClosed);
    };
  }, [room, roomId, currentUser, needsJoinProfile]);

  useEffect(() => {
    const supportsDisplayMedia = Boolean(
      typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia
    );
    setCanShareScreen(supportsDisplayMedia);
    const handleOnline = () => setNetworkStatus("online");
    const handleOffline = () => setNetworkStatus("offline");
    const updateConnectionType = () => {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (connection?.effectiveType) {
        setConnectionType(connection.effectiveType);
      }
      if (typeof connection?.saveData === "boolean") {
        setSaveData(connection.saveData);
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    updateConnectionType();
    if (navigator.connection) {
      navigator.connection.addEventListener("change", updateConnectionType);
    }

    const unlockAudio = () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        } else {
          // Audio is ready.
        }
      } catch (error) {
        // Ignore autoplay restrictions.
      }
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (navigator.connection) {
        navigator.connection.removeEventListener("change", updateConnectionType);
      }
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      liveKitRoomRef.current?.disconnect();
      liveKitRoomRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!room || !currentUser) return;
    if (currentUser.role === "Student" && !approved) return;
    if (liveKitRoomRef.current) return;
    let active = true;

    const connectLiveKit = async () => {
      try {
        const data = await fetchLivekitToken(roomId, currentUser);
        if (!active) return;
        const token =
          typeof data?.token === "string"
            ? data.token
            : data?.token?.token || data?.token?.accessToken || "";
        if (!token) {
          throw new Error("LiveKit token is missing or invalid");
        }
        const lkRoom = new Room({
          adaptiveStream: true,
          dynacast: true
        });
        setLiveKitRoom(lkRoom);

        lkRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          const next = {};
          speakers.forEach((participant) => {
            const name = normalizeName(getParticipantName(participant));
            if (name) {
              next[name] = true;
            }
          });
          setSpeakingMap(next);
          if (currentUser?.name) {
            setIsSpeaking(Boolean(next[normalizeName(currentUser.name)]));
          }
        });

        lkRoom.on(RoomEvent.LocalTrackPublished, (publication) => {
          if (publication.source === Track.Source.ScreenShare) {
            if (localVideoRef.current && publication.track) {
              publication.track.attach(localVideoRef.current);
            }
            setIsSharing(true);
          }
          if (publication.source === Track.Source.Camera) {
            if (localCameraRef.current && publication.track) {
              publication.track.attach(localCameraRef.current);
            }
            setCameraEnabled(true);
          }
          if (publication.source === Track.Source.Microphone) {
            setMicEnabled(true);
          }
        });

        lkRoom.on(RoomEvent.LocalTrackUnpublished, (publication) => {
          if (publication.source === Track.Source.ScreenShare) {
            if (localVideoRef.current && publication.track) {
              publication.track.detach(localVideoRef.current);
            }
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = null;
            }
            setIsSharing(false);
          }
          if (publication.source === Track.Source.Camera) {
            if (localCameraRef.current && publication.track) {
              publication.track.detach(localCameraRef.current);
            }
            if (localCameraRef.current) {
              localCameraRef.current.srcObject = null;
            }
            setCameraEnabled(false);
          }
          if (publication.source === Track.Source.Microphone) {
            setMicEnabled(false);
          }
        });

        lkRoom.on(RoomEvent.Disconnected, () => {
          setLiveKitRoom(null);
        });

        await lkRoom.connect(data.url, token);
        if (!active) {
          lkRoom.disconnect();
          return;
        }
        liveKitRoomRef.current = lkRoom;
      } catch (error) {
        console.error("Failed to connect LiveKit", error);
      }
    };

    connectLiveKit();

    return () => {
      active = false;
    };
  }, [room, roomId, currentUser, approved]);

  useEffect(() => {
    const lkRoom = liveKitRoomRef.current;
    if (!lkRoom || !localCameraRef.current) return;
    const publication = lkRoom.localParticipant.getTrackPublication(Track.Source.Camera);
    if (!cameraEnabled || !publication?.track) return;
    const track = publication.track;
    track.attach(localCameraRef.current);
    return () => track.detach?.(localCameraRef.current);
  }, [cameraEnabled]);

  useEffect(() => {
    const lkRoom = liveKitRoomRef.current;
    if (!lkRoom || !localVideoRef.current) return;
    const publication = lkRoom.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    if (!isSharing || !publication?.track) return;
    const track = publication.track;
    track.attach(localVideoRef.current);
    return () => track.detach?.(localVideoRef.current);
  }, [isSharing]);

  const roleBadge = useMemo(() => {
    if (!currentUser) return "Guest";
    return currentUser.role === "Teacher" ? "Teacher" : approved ? "Student" : "Pending";
  }, [currentUser, approved]);

  const handleSend = (event) => {
    event.preventDefault();
    if (classClosed) return;
    if (!currentUser) return;
    if (!message.trim()) return;
    const socket = getSocket();
    socket.emit("chat-message", {
      roomId,
      message: message.trim(),
      user: currentUser
    });
    setMessage("");
  };

  const handleCopyLink = async () => {
    try {
      const link = `${window.location.origin}/classroom/${roomId}?join=1`;
      await navigator.clipboard.writeText(link);
      setCopyStatus("คัดลอกลิงก์แล้ว");
      setTimeout(() => setCopyStatus(""), 2000);
    } catch (error) {
      setCopyStatus("คัดลอกไม่สำเร็จ");
      setTimeout(() => setCopyStatus(""), 2000);
    }
  };

  const handleJoinSubmit = (event) => {
    event.preventDefault();
    if (!joinName.trim()) return;
    const nextUser = { name: joinName.trim(), role: "Student" };
    dispatch(setUser(nextUser));
    setCurrentUser(nextUser);
    setApproved(false);
    setNeedsJoinProfile(false);
  };

  const handleUploadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadStatus("กำลังอัปโหลด...");
    try {
      await uploadRoomFile(roomId, file);
      const data = await fetchRoomFiles(roomId);
      setFiles(data.files);
      setUploadStatus("อัปโหลดสำเร็จ");
    } catch (error) {
      setUploadStatus("อัปโหลดไม่สำเร็จ");
    } finally {
      event.target.value = "";
      setTimeout(() => setUploadStatus(""), 2000);
    }
  };

  const handleRefreshFiles = async () => {
    try {
      const data = await fetchRoomFiles(roomId);
      setFiles(data.files);
      setUploadStatus("รีเฟรชแล้ว");
    } catch (error) {
      setUploadStatus("รีเฟรชไม่สำเร็จ");
    } finally {
      setTimeout(() => setUploadStatus(""), 2000);
    }
  };

  const handleDeleteFile = async (fileId) => {
    try {
      await deleteRoomFile(roomId, fileId);
      const data = await fetchRoomFiles(roomId);
      setFiles(data.files);
    } catch (error) {
      const message =
        error?.response?.data?.message || error?.message || "ลบไฟล์ไม่สำเร็จ";
      setUploadStatus(message);
      setTimeout(() => setUploadStatus(""), 2000);
    }
  };

  const handleApprove = (socketId) => {
    if (classClosed) return;
    const socket = getSocket();
    socket.emit("approve-join", { roomId, socketId });
  };

  const handleStartShare = async () => {
    setShareError("");
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setShareError("อุปกรณ์นี้ไม่รองรับการแชร์หน้าจอ");
        return;
      }
      const lkRoom = liveKitRoomRef.current;
      if (!lkRoom) {
        setShareError("Live session ยังไม่พร้อม");
        return;
      }
      const tracks = await createLocalScreenTracks({
        audio: true,
        video: {
          width: 1920,
          height: 1080,
          frameRate: 30
        }
      });
      screenTracksRef.current = tracks;
      await Promise.all(tracks.map((track) => lkRoom.localParticipant.publishTrack(track)));
      setIsSharing(true);
      const videoTrack = tracks.find((track) => track.kind === Track.Kind.Video);
      if (videoTrack && localVideoRef.current) {
        videoTrack.attach(localVideoRef.current);
      }
    } catch (error) {
      const name = error?.name || "UnknownError";
      const message = error?.message || "Unknown reason";
      if (name === "NotAllowedError") {
        setShareError("ยกเลิกการแชร์หน้าจอ");
      } else if (name === "NotFoundError") {
        setShareError("ไม่พบแหล่งแชร์หน้าจอ");
      } else {
        setShareError(`ไม่สามารถแชร์หน้าจอได้: ${name} (${message})`);
      }
    }
  };

  const handleStopShare = () => {
    const lkRoom = liveKitRoomRef.current;
    if (lkRoom) {
      screenTracksRef.current.forEach((track) => {
        lkRoom.localParticipant.unpublishTrack(track);
        track.stop?.();
        track.detach?.();
      });
      screenTracksRef.current = [];
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setIsSharing(false);
  };

  const handleStartCamera = async () => {
    setCameraError("");
    try {
      if (currentUser?.role === "Teacher" && isSharing) {
        setCameraError("กรุณาหยุดแชร์หน้าจอก่อนเปิดกล้อง");
        return;
      }
      const lkRoom = liveKitRoomRef.current;
      if (!lkRoom) {
        setCameraError("Live session ยังไม่พร้อม");
        return;
      }
      await lkRoom.localParticipant.setCameraEnabled(true, {
        width: 1280,
        height: 720,
        frameRate: 24
      });
      setCameraEnabled(true);
      const publication = lkRoom.localParticipant.getTrackPublication(Track.Source.Camera);
      if (publication?.track && localCameraRef.current) {
        publication.track.attach(localCameraRef.current);
      }
    } catch (error) {
      const name = error?.name || "UnknownError";
      const message = error?.message || "Unknown reason";
      setCameraError(`ไม่สามารถเปิดกล้องได้: ${name} (${message})`);
    }
  };

  const handleStopCamera = () => {
    const lkRoom = liveKitRoomRef.current;
    if (lkRoom) {
      lkRoom.localParticipant.setCameraEnabled(false);
      const publication = lkRoom.localParticipant.getTrackPublication(Track.Source.Camera);
      if (publication?.track && localCameraRef.current) {
        publication.track.detach(localCameraRef.current);
      }
    }
    if (localCameraRef.current) {
      localCameraRef.current.srcObject = null;
    }
    setCameraEnabled(false);
    setCameraError("");
  };

  const handleStartMic = async () => {
    setMicError("");
    try {
      const lkRoom = liveKitRoomRef.current;
      if (!lkRoom) {
        setMicError("Live session ยังไม่พร้อม");
        return;
      }
      await lkRoom.localParticipant.setMicrophoneEnabled(true);
      setMicEnabled(true);
    } catch (error) {
      const name = error?.name || "UnknownError";
      const message = error?.message || "Unknown reason";
      setMicError(`ไม่สามารถเปิดไมค์ได้: ${name} (${message})`);
    }
  };

  const handleStopMic = () => {
    const lkRoom = liveKitRoomRef.current;
    if (lkRoom) {
      lkRoom.localParticipant.setMicrophoneEnabled(false);
    }
    setMicEnabled(false);
    setMicError("");
  };

  const handleCloseClass = () => {
    const socket = getSocket();
    handleStopShare();
    handleStopCamera();
    handleStopMic();
    socket.emit("close-class", { roomId });
    navigate("/dashboard");
  };

  const handleFullscreen = async () => {
    const containerEl = liveVideoContainerRef.current;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (containerEl?.requestFullscreen) {
      await containerEl.requestFullscreen();
      return;
    }
    if (containerEl?.webkitEnterFullscreen) {
      containerEl.webkitEnterFullscreen();
    }
  };

  const handleRefreshLive = () => {
    liveKitRoomRef.current?.disconnect();
    liveKitRoomRef.current = null;
    setLiveKitRoom(null);
    setHasRemoteStream(false);
    if (currentUser?.role === "Student") {
      setApproved(false);
    }

    if (!currentUser) return;
    const socket = getSocket();
    socket.disconnect();
    socket.connect();
  };

  if (loading) {
    return (
      <main className="min-h-screen px-6 py-10">
        <div className="glass-panel mx-auto max-w-4xl rounded-3xl p-8 text-ink-200">
          กำลังโหลดห้องเรียน...
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="min-h-screen px-6 py-10">
        <div className="glass-panel mx-auto max-w-4xl rounded-3xl p-8 text-ink-200">
          ไม่พบห้องเรียนนี้
          <button
            className="ml-4 rounded-full border border-ink-900/20 bg-white/70 px-4 py-1 text-xs text-ink-700"
            onClick={() => navigate("/dashboard")}
          >
            กลับไปยัง Dashboard
          </button>
        </div>
      </main>
    );
  }

  if (!currentUser && !joinMode) {
    return (
      <main className="min-h-screen px-6 py-10">
        <div className="glass-panel mx-auto max-w-4xl rounded-3xl p-8 text-ink-700 soft-shadow">
          กรุณาเข้าสู่ระบบก่อนเข้าห้องเรียน
          <button
            className="ml-4 rounded-full border border-ink-900/20 bg-white/70 px-4 py-1 text-xs text-ink-700"
            onClick={() => navigate("/login")}
          >
            ไปหน้า Login
          </button>
        </div>
      </main>
    );
  }

  const content = (
    <main className="min-h-screen overflow-y-auto px-4 py-6 md:px-6">
      {currentUser?.role === "Student" && needsMediaAccess && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          กรุณากดเพื่ออนุญาตไมค์/กล้องก่อนเข้าห้อง
          <button
            type="button"
            onClick={requestMediaPermissions}
            className="ml-3 rounded-full border border-rose-200 bg-white px-3 py-1 text-xs text-rose-700 transition hover:border-rose-300"
          >
            อนุญาต
          </button>
        </div>
      )}
      {needsJoinProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-sky-200/70 backdrop-blur-sm" />
          <form
            onSubmit={handleJoinSubmit}
            className="relative z-10 w-full max-w-md rounded-3xl border border-ink-900/20 bg-white/90 p-6 text-ink-700 soft-shadow"
          >
            <h2 className="font-display text-xl text-ink-900">เข้าร่วมห้องเรียน</h2>
            <p className="mt-2 text-sm text-ink-600">
              ลิงก์นี้สำหรับนักเรียน กรุณาระบุชื่อก่อนเข้าห้อง
            </p>
            <label className="mt-6 block text-sm text-ink-700">ชื่อที่ใช้ในห้องเรียน</label>
            <input
              value={joinName}
              onChange={(event) => setJoinName(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-ink-900/10 bg-white/80 px-4 py-3 text-ink-900 outline-none focus:border-sky-400"
              placeholder="กรอกชื่อของคุณ"
              required
            />
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => navigate("/login")}
              className="rounded-full border border-ink-900/20 bg-white/70 px-4 py-2 text-xs font-semibold text-ink-700"
            >
              กลับไปหน้า Login
              </button>
              <button
                type="submit"
                className="rounded-full bg-sky-500 px-5 py-2 text-xs font-semibold text-white"
              >
                เข้าเป็นนักเรียน
              </button>
            </div>
          </form>
        </div>
      )}
      {classClosed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-sky-200/70 backdrop-blur-sm" />
          <div className="relative z-10 flex flex-col items-center gap-3 rounded-2xl border border-ink-900/20 bg-white/90 px-6 py-4 text-sm text-ink-700 soft-shadow">
            <span className="text-base font-semibold text-ink-900">คลาสสิ้นสุดแล้ว</span>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold text-white"
            >
              กลับไปหน้า Dashboard
            </button>
          </div>
        </div>
      )}
      {currentUser?.role === "Student" && !approved && !classClosed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-sky-200/70 backdrop-blur-sm" />
          <div className="relative z-10 flex items-center gap-3 rounded-2xl border border-ink-900/20 bg-white/90 px-6 py-4 text-sm text-ink-700 soft-shadow">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
            กำลังรอครูอนุมัติให้เข้าห้อง...
          </div>
        </div>
      )}
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-6 animate-fade-up">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ink-500">Classroom</p>
            <h1 className="font-display text-3xl text-ink-900">{room.title}</h1>
            <p className="text-ink-600">โดย {room.teacherName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-700">
            {currentUser?.role === "Teacher" && (
              <button
                type="button"
                onClick={handleCopyLink}
                className="rounded-full border border-ink-900/20 bg-white/70 px-3 py-1 text-xs text-ink-700 transition hover:border-ink-900/40"
              >
                คัดลอกลิงก์เชิญ
              </button>
            )}
            {copyStatus && <span className="text-xs text-ink-600">{copyStatus}</span>}
            <span className="rounded-full border border-ink-900/15 px-3 py-1">{roleBadge}</span>
            {currentUser?.role === "Teacher" && (
              <button
                type="button"
                onClick={handleCloseClass}
                className="rounded-full border border-blush-400/60 bg-blush-400/20 px-3 py-1 text-xs text-blush-600 transition hover:border-blush-400"
              >
                ปิดคลาส
              </button>
            )}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="glass-panel rounded-3xl p-4 md:p-6 soft-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Video className="h-5 w-5 text-sky-600" />
                  <h2 className="font-display text-xl text-ink-900">Live Video</h2>
                </div>
                <div className="flex items-center gap-2">
                  {currentUser?.role === "Student" && (
                    <button
                      type="button"
                      onClick={handleFullscreen}
                      className="inline-flex items-center gap-1 rounded-full border border-ink-900/20 bg-white/70 px-3 py-1 text-xs text-ink-700 transition hover:border-ink-900/40"
                    >
                      <Maximize2 className="h-3 w-3" />
                      {isFullscreen ? "ย่อหน้าจอ" : "เต็มจอ"}
                    </button>
                  )}
                  <span className="rounded-full bg-sky-200/60 px-3 py-1 text-xs text-sky-700">
                    ถ่ายทอดสด
                  </span>
                </div>
              </div>
            <div
              ref={liveVideoContainerRef}
              className="relative mt-4 aspect-video w-full overflow-hidden rounded-2xl border bg-gradient-to-br from-white gray-50 to-gray-100"
            >
              {currentUser?.role === "Teacher" ? (
                <video
                  ref={localVideoRef}
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />
              ) : (
                liveKitRoom && (
                  <LiveKitTeacherStream
                    onStreamChange={setHasRemoteStream}
                    className="h-full w-full object-cover"
                  />
                )
              )}
              {cameraEnabled && (
                <div className="absolute bottom-3 right-3 h-28 w-40 overflow-hidden rounded-xl border border-white/40 bg-ink-900/5 shadow-sm">
                  <video
                    ref={localCameraRef}
                    className="h-full w-full object-cover"
                    autoPlay
                    muted
                    playsInline
                  />
                </div>
              )}
              {!isSharing && currentUser?.role === "Teacher" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center text-ink-600">
                  <div className="rounded-full border border-ink-900/20 bg-white/70 px-4 py-1 text-xs uppercase tracking-[0.3em]">
                    Screen Share
                  </div>
                  <p className="text-sm">เริ่มแชร์หน้าจอเพื่อสอนสด</p>
                </div>
              )}
              {!hasRemoteStream && currentUser?.role === "Student" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center text-ink-600">
                  <div className="rounded-full border border-ink-900/20 bg-white/70 px-4 py-1 text-xs uppercase tracking-[0.3em]">
                    Waiting for Stream
                  </div>
                  <p className="text-sm">รอครูเริ่มแชร์หน้าจอ</p>
                </div>
              )}
            </div>

            {(currentUser?.role === "Teacher" || approved) && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {currentUser?.role === "Teacher" && (
                  <>
                    <button
                      onClick={isSharing ? handleStopShare : handleStartShare}
                      disabled={!canShareScreen}
                      className="rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200/70 transition hover:-translate-y-0.5 hover:bg-sky-400"
                    >
                      {isSharing ? "หยุดแชร์หน้าจอ" : "เริ่มแชร์หน้าจอ"}
                    </button>
                    {!canShareScreen && (
                      <span className="text-sm text-ink-600">
                        มือถือบางรุ่น/เบราว์เซอร์ไม่รองรับการแชร์หน้าจอ
                      </span>
                    )}
                    {shareError && <span className="text-sm text-rose-600">{shareError}</span>}
                  </>
                )}
                <button
                  onClick={cameraEnabled ? handleStopCamera : handleStartCamera}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink-900/20 bg-white/70 text-ink-800 shadow-sm transition hover:-translate-y-0.5 hover:border-ink-900/40"
                  title={cameraEnabled ? "ปิดกล้อง" : "เปิดกล้อง"}
                >
                  {cameraEnabled ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
                </button>
                {cameraError && <span className="text-sm text-rose-600">{cameraError}</span>}
                <button
                  onClick={micEnabled ? handleStopMic : handleStartMic}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink-900/20 bg-white/70 text-ink-800 shadow-sm transition hover:-translate-y-0.5 hover:border-ink-900/40 ${
                    micEnabled && isSpeaking ? "ring-2 ring-emerald-300 animate-pulse" : ""
                  }`}
                  title={micEnabled ? "ปิดไมค์" : "เปิดไมค์"}
                >
                  {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </button>
                <button
                  onClick={handleRefreshLive}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-ink-900/20 bg-white/70 px-4 text-[11px] font-semibold text-ink-700 shadow-sm transition hover:-translate-y-0.5 hover:border-ink-900/40"
                >
                  รีเฟรชจอ
                </button>
                {micError && <span className="text-sm text-rose-600">{micError}</span>}
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-ink-900/10 bg-white/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-ink-600">ไฟล์ประกอบการเรียน</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRefreshFiles}
                    className="rounded-full border border-ink-900/20 bg-white/70 px-3 py-1 text-xs text-ink-700 transition hover:border-ink-900/40"
                  >
                    รีเฟรช
                  </button>
                  {currentUser?.role === "Teacher" && (
                    <label className="cursor-pointer rounded-full border border-ink-900/20 bg-white/70 px-3 py-1 text-xs text-ink-700 transition hover:border-ink-900/40">
                      อัปโหลดไฟล์
                      <input
                        type="file"
                        onChange={handleUploadFile}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
              {uploadStatus && <p className="mt-2 text-xs text-ink-600">{uploadStatus}</p>}
              {files.length === 0 ? (
                <p className="mt-3 text-sm text-ink-600">ยังไม่มีไฟล์ให้ดาวน์โหลด</p>
              ) : (
                <div className="mt-3 max-h-60 overflow-y-auto pr-1">
                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between rounded-xl border border-ink-900/10 bg-white/80 p-2 text-[11px] text-ink-800"
                      >
                        <span className="truncate text-[11px] text-ink-900">{file.name}</span>
                        <div className="ml-2 flex items-center gap-2">
                          <a
                            href={`${getApiBase()}/api/rooms/${roomId}/files/${file.id}`}
                            className="rounded-full border border-ink-900/20 bg-white/70 px-2 py-0.5 text-[11px] text-ink-700 transition hover:border-ink-900/40"
                            download
                          >
                            ดาวน์โหลด
                          </a>
                          {currentUser?.role === "Teacher" && (
                            <button
                              type="button"
                              onClick={() => handleDeleteFile(file.id)}
                              className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700 transition hover:border-rose-300"
                            >
                              ลบ
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </section>

          <aside className="glass-panel flex h-[640px] flex-col rounded-3xl p-4 md:h-[680px] md:p-6 soft-shadow">
            {liveKitRoom && <RoomAudioRenderer />}
            {currentUser?.role === "Student" && (
              <div className="rounded-2xl border border-ink-900/10 bg-white/70 p-3 text-sm text-ink-700">
                ครูผู้สอน: <span className="font-semibold text-ink-900">{room.teacherName}</span>
              </div>
            )}
            {currentUser?.role === "Student" && approvedList.length > 0 && (
              <div className="mt-3 rounded-2xl border border-ink-900/10 bg-white/70 p-3">
                <p className="text-xs font-semibold text-ink-600">เพื่อนในห้อง</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {approvedList
                    .filter((entry) => entry.user?.name && entry.user.name !== currentUser?.name)
                    .map((entry) => (
                      <span
                        key={entry.socketId}
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          speakingMap[normalizeName(entry.user?.name)]
                            ? "border-emerald-300 bg-emerald-100 text-emerald-800 animate-pulse"
                            : "border-ink-900/10 bg-white/70 text-ink-800"
                        }`}
                      >
                        {entry.user.name}
                      </span>
                    ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageCircle className="h-5 w-5 text-sky-600" />
                <h2 className="font-display text-xl text-ink-900">Live Chat</h2>
              </div>
              <span className="flex items-center gap-1 text-xs text-ink-600">
                <Users2 className="h-4 w-4" />
                {pending.length} pending
              </span>
            </div>

            {currentUser?.role === "Teacher" && pending.length > 0 && (
              <div className="mt-4 rounded-2xl border border-ink-900/10 bg-white/70 p-4">
                <p className="text-xs font-semibold text-ink-600">คำขอเข้าห้อง</p>
                <div className="mt-3 space-y-3">
                  {pending.map((request) => (
                    <div
                      key={request.socketId}
                      className="flex items-center justify-between rounded-xl border border-ink-900/10 bg-white/70 px-3 py-2 text-sm"
                    >
                      <span>{request.user.name}</span>
                      <button
                        onClick={() => handleApprove(request.socketId)}
                        className="inline-flex items-center gap-1 rounded-full bg-sky-200/70 px-3 py-1 text-xs text-sky-700 transition hover:-translate-y-0.5"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        อนุมัติ
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentUser?.role === "Teacher" && (
              <div className="mt-4 rounded-2xl border border-ink-900/10 bg-white/70 p-4">
                <p className="text-xs font-semibold text-ink-600">นักเรียนในห้อง</p>
                {approvedList.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-600">ยังไม่มีนักเรียนที่ได้รับอนุมัติ</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {approvedList.map((entry) => (
                        <span
                          key={entry.socketId}
                          className={`rounded-full border px-3 py-1 text-xs ${
                            speakingMap[normalizeName(entry.user?.name)]
                              ? "border-emerald-300 bg-emerald-100 text-emerald-800 animate-pulse"
                              : "border-ink-900/10 bg-white/70 text-ink-800"
                          }`}
                        >
                          {entry.user?.name}
                        </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {currentUser?.role === "Teacher" && liveKitRoom && (
              <LiveKitStudentCameraSection />
            )}
            <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-2">
              {messages.length === 0 ? (
                <div className="rounded-2xl border border-ink-900/10 bg-white/70 p-4 text-sm text-ink-600">
                  ยังไม่มีข้อความในห้องเรียนนี้
                </div>
              ) : (
                messages.map((item, index) => (
                  <div
                    key={`${item.timestamp}-${index}`}
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      item.user?.name === currentUser?.name
                        ? "ml-auto bg-sky-200/70 text-ink-900"
                        : "bg-white/80 text-ink-800"
                    }`}
                  >
                    <p className="text-xs text-ink-500">{item.user?.name}</p>
                    <p className="mt-1 text-sm text-ink-900">{item.message}</p>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSend} className="mt-4 flex items-center gap-2">
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="flex-1 rounded-2xl border border-ink-900/10 bg-white/70 px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-sky-400"
                placeholder={approved || currentUser?.role === "Teacher" ? "พิมพ์ข้อความ..." : "รออนุมัติเพื่อเริ่มแชท"}
                disabled={!approved && currentUser?.role === "Student"}
              />
              <button
                type="submit"
                disabled={!approved && currentUser?.role === "Student"}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-white transition hover:-translate-y-0.5 hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-white/60"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </aside>
        </div>
      </div>
    </main>
  );

  return liveKitRoom ? (
    <RoomContext.Provider value={liveKitRoom}>{content}</RoomContext.Provider>
  ) : (
    content
  );
}
