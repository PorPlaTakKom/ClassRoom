import { memo, useEffect, useMemo, useRef, useState } from "react";
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
import {
  deleteRoomFile,
  fetchRoom,
  fetchRoomFiles,
  getApiBase,
  uploadRoomFile
} from "../lib/api.js";
import { getSocket } from "../lib/socket.js";
import { getStoredUser, storeUser } from "../lib/storage.js";

const RTC_CONFIG = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
};

const RemoteVideo = memo(function RemoteVideo({ stream, className }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay
      muted
      playsInline
    />
  );
});

const applySenderParams = (sender, kind) => {
  if (!sender?.getParameters) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings) params.encodings = [{}];
    if (kind === "screen") {
      params.encodings[0].maxBitrate = 1_500_000;
      params.degradationPreference = "maintain-resolution";
    } else if (kind === "camera") {
      params.encodings[0].maxBitrate = 800_000;
      params.degradationPreference = "maintain-framerate";
    } else if (kind === "audio") {
      params.encodings[0].maxBitrate = 32_000;
    }
    sender.setParameters(params).catch(() => {});
  } catch (error) {
    // Ignore browsers that block setParameters.
  }
};

const formatFileSize = (bytes) => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
};

function AudioPlayer({ stream }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay />;
}

export default function Classroom({ user }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const joinMode = new URLSearchParams(location.search).get("join") === "1";
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const screenStreamRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(user ?? getStoredUser());
  const [approved, setApproved] = useState(currentUser?.role === "Teacher");
  const [pending, setPending] = useState([]);
  const [approvedList, setApprovedList] = useState([]);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [connected, setConnected] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canShareScreen, setCanShareScreen] = useState(true);
  const audioCtxRef = useRef(null);
  const [audioReady, setAudioReady] = useState(false);
  const [classClosed, setClassClosed] = useState(false);
  const [networkStatus, setNetworkStatus] = useState(() =>
    typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline"
  );
  const [connectionType, setConnectionType] = useState("unknown");
  const [saveData, setSaveData] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micError, setMicError] = useState("");
  const [micAvailable, setMicAvailable] = useState(true);
  const [micPermission, setMicPermission] = useState("unknown");
  const [mediaPermission, setMediaPermission] = useState("unknown");
  const [needsMediaAccess, setNeedsMediaAccess] = useState(false);
  const [speakingMap, setSpeakingMap] = useState({});
  const [isSpeaking, setIsSpeaking] = useState(false);
  const micStreamRef = useRef(null);
  const [audioStreams, setAudioStreams] = useState([]);
  const micAnalyserRef = useRef(null);
  const micRafRef = useRef(null);
  const micSendersRef = useRef(new Map());
  const chatEndRef = useRef(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const cameraStreamRef = useRef(null);
  const localCameraRef = useRef(null);
  const [remoteVideoStreams, setRemoteVideoStreams] = useState([]);
  const [needsJoinProfile, setNeedsJoinProfile] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const playNotification = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch (error) {
      // Ignore autoplay restrictions.
    }
  };

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
    if (!navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
        setMediaPermission("granted");
        setNeedsMediaAccess(false);
      })
      .catch(() => {
        setMediaPermission("denied");
        setNeedsMediaAccess(true);
      });
  }, [room, currentUser, needsJoinProfile]);

  const requestMediaPermissions = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((track) => track.stop());
      setMediaPermission("granted");
      setNeedsMediaAccess(false);
    } catch (error) {
      setMediaPermission("denied");
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
    setCurrentUser(user ?? getStoredUser());
  }, [user]);

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
      setConnected(true);
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

    const handleDisconnect = () => setConnected(false);

    const handleJoinRequest = (payload) => {
      setPending(payload.pending);
    };

    const handlePendingNotify = (payload) => {
      setPending(payload.pending);
      if (currentUser.role === "Teacher" && payload.pending?.length) {
        playNotification();
      }
    };

    const handleApprovedList = (payload) => {
      setApprovedList(payload.approved || []);
      if (currentUser.role !== "Teacher") return;
      payload.approved?.forEach((entry) => {
        if (!entry?.socketId) return;
        if (peerConnectionsRef.current.has(entry.socketId)) return;
        const peer = createPeer(entry.socketId);
        attachScreenTracks(peer);
        attachMicTracks(peer);
        attachCameraTracks(peer);
        forceOffer(peer, entry.socketId);
      });
    };

    const handleStudentApproved = (payload) => {
      setApprovedList((prev) => {
        if (!payload?.socketId) return prev;
        if (prev.some((entry) => entry.socketId === payload.socketId)) return prev;
        return [...prev, { socketId: payload.socketId, user: payload.user }];
      });
      if (currentUser.role === "Teacher" && payload?.autoApproved) {
        playNotification();
      }
      if (currentUser.role !== "Teacher") return;
      if (!payload?.socketId) return;
      if (peerConnectionsRef.current.has(payload.socketId)) return;
      const peer = createPeer(payload.socketId);
      attachScreenTracks(peer);
      attachMicTracks(peer);
      attachCameraTracks(peer);
      forceOffer(peer, payload.socketId);
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

    // keep streaming in sync with approved students

    const handleWebRtcOffer = async (payload) => {
      const socket = getSocket();
      const peer = createPeer(payload.from);
      await peer.setRemoteDescription(payload.offer);
      attachMicTracks(peer);
      attachCameraTracks(peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("webrtc-answer", {
        targetId: payload.from,
        answer
      });
    };

    const handleWebRtcAnswer = async (payload) => {
      const peer = peerConnectionsRef.current.get(payload.from);
      if (!peer) return;
      await peer.setRemoteDescription(payload.answer);
    };

    const handleWebRtcIce = async (payload) => {
      const peer = peerConnectionsRef.current.get(payload.from);
      if (!peer) return;
      try {
        await peer.addIceCandidate(payload.candidate);
      } catch (error) {
        console.warn("Failed to add ICE candidate", error);
      }
    };

    const handleWebRtcStop = () => {
      if (currentUser?.role === "Student") {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
        setHasRemoteStream(false);
      }
    };

    const handleCameraStop = (payload) => {
      if (currentUser?.role === "Student") {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
        setHasRemoteStream(false);
      } else if (currentUser?.role === "Teacher" && payload?.socketId) {
        setRemoteVideoStreams((prev) =>
          prev.filter((item) => item.socketId !== payload.socketId)
        );
      }
    };

    const handleClassClosed = () => {
      setClassClosed(true);
      setApproved(false);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      setAudioStreams([]);
      setRemoteVideoStreams([]);
      setSpeakingMap({});
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
        setMicEnabled(false);
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
        setCameraEnabled(false);
      }
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
    socket.on("webrtc-offer", handleWebRtcOffer);
    socket.on("webrtc-answer", handleWebRtcAnswer);
    socket.on("webrtc-ice", handleWebRtcIce);
    socket.on("webrtc-stop", handleWebRtcStop);
    socket.on("camera-stop", handleCameraStop);
    socket.on("class-closed", handleClassClosed);
    socket.on("speaking", handleSpeaking);

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
      socket.off("webrtc-offer", handleWebRtcOffer);
      socket.off("webrtc-answer", handleWebRtcAnswer);
      socket.off("webrtc-ice", handleWebRtcIce);
      socket.off("webrtc-stop", handleWebRtcStop);
      socket.off("camera-stop", handleCameraStop);
      socket.off("class-closed", handleClassClosed);
      socket.off("speaking", handleSpeaking);
    };
  }, [room, roomId, currentUser, needsJoinProfile, needsMediaAccess, mediaPermission]);

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

    const checkMic = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setMicAvailable(false);
        return;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasMic = devices.some((device) => device.kind === "audioinput");
        setMicAvailable(hasMic);
        if (!hasMic) return;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
          setMicPermission("granted");
        } catch (error) {
          if (error?.name === "NotAllowedError") {
            setMicPermission("denied");
          } else {
            setMicPermission("unknown");
          }
        }
      } catch (error) {
        setMicAvailable(false);
      }
    };

    checkMic();
    const unlockAudio = () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") {
          ctx.resume().then(() => setAudioReady(true)).catch(() => {});
        } else {
          setAudioReady(true);
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
      stopMicMonitor();
      peerConnectionsRef.current.forEach((peer) => peer.close());
      peerConnectionsRef.current.clear();
      micSendersRef.current.clear();
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
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
    if (localCameraRef.current && cameraStreamRef.current) {
      localCameraRef.current.srcObject = cameraStreamRef.current;
      localCameraRef.current.play?.().catch(() => {});
    }
  }, [cameraEnabled]);

  const handleSpeaking = (payload) => {
    if (!payload?.name) return;
    setSpeakingMap((prev) => ({ ...prev, [payload.name]: payload.speaking }));
  };

  useEffect(() => {
    if (!currentUser || !micEnabled) return;
    const socket = getSocket();
    socket.emit("speaking", {
      roomId,
      user: currentUser,
      speaking: isSpeaking
    });
  }, [isSpeaking, micEnabled, currentUser, roomId]);

  const createPeer = (targetId) => {
    if (peerConnectionsRef.current.has(targetId)) {
      return peerConnectionsRef.current.get(targetId);
    }
    const socket = getSocket();
    const peer = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionsRef.current.set(targetId, peer);

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (event.track.kind === "video") {
        if (currentUser?.role === "Student" && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          setHasRemoteStream(true);
          event.track.onended = () => {
            if (remoteVideoRef.current?.srcObject === stream) {
              remoteVideoRef.current.srcObject = null;
            }
            setHasRemoteStream(false);
          };
        } else if (currentUser?.role === "Teacher") {
          event.track.onended = () => {
            setRemoteVideoStreams((prev) => prev.filter((item) => item.stream !== stream));
          };
          setRemoteVideoStreams((prev) => {
            const key = `${targetId}-${stream.id}`;
            if (prev.some((item) => item.id === key)) return prev;
            return [...prev, { id: key, stream, socketId: targetId }];
          });
        }
        return;
      }

      if (event.track.kind === "audio") {
        setAudioStreams((prev) => {
          if (prev.some((item) => item.id === targetId)) return prev;
          return [...prev, { id: targetId, stream }];
        });
      }
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc-ice", {
          targetId,
          candidate: event.candidate
        });
      }
    };

    peer.onnegotiationneeded = async () => {
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit("webrtc-offer", {
          targetId,
          offer,
          roomId
        });
      } catch (error) {
        console.warn("Negotiation failed", error);
      }
    };

    return peer;
  };

  const attachScreenTracks = (peer) => {
    if (!screenStreamRef.current) return;
    screenStreamRef.current.getTracks().forEach((track) => {
      track.contentHint = "detail";
      const sender = peer.addTrack(track, screenStreamRef.current);
      applySenderParams(sender, "screen");
    });
  };

  const attachMicTracks = (peer) => {
    if (!micStreamRef.current) return;
    const track = micStreamRef.current.getAudioTracks()[0];
    if (!track) return;
    track.contentHint = "speech";
    const sender = micSendersRef.current.get(peer);
    if (sender) {
      sender.replaceTrack(track);
      applySenderParams(sender, "audio");
    } else {
      const nextSender = peer.addTrack(track, micStreamRef.current);
      micSendersRef.current.set(peer, nextSender);
      applySenderParams(nextSender, "audio");
    }
  };

  const attachCameraTracks = (peer) => {
    if (!cameraStreamRef.current) return;
    cameraStreamRef.current.getTracks().forEach((track) => {
      track.contentHint = "motion";
      const sender = peer.addTrack(track, cameraStreamRef.current);
      applySenderParams(sender, "camera");
    });
  };

  const forceOffer = async (peer, targetId) => {
    if (!peer) return;
    const socket = getSocket();
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit("webrtc-offer", { targetId, offer, roomId });
    } catch (error) {
      // Ignore failed offers.
    }
  };

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
    storeUser(nextUser);
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
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: false
      });
      screenStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setIsSharing(true);
      const socket = getSocket();
      socket.emit("teacher-ready", { roomId });

      stream.getVideoTracks()[0].addEventListener("ended", () => {
        handleStopShare();
      });
    } catch (error) {
      setShareError("ไม่สามารถแชร์หน้าจอได้ โปรดลองใหม่อีกครั้ง");
    }
  };

  const handleStopShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    peerConnectionsRef.current.forEach((peer) => peer.close());
    peerConnectionsRef.current.clear();
    setIsSharing(false);
    const socket = getSocket();
    socket.emit("webrtc-stop", { roomId });
  };

  const handleStartCamera = async () => {
    setCameraError("");
    try {
      if (currentUser?.role === "Teacher" && isSharing) {
        setCameraError("กรุณาหยุดแชร์หน้าจอก่อนเปิดกล้อง");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          frameRate: { ideal: 24, max: 30 }
        },
        audio: false
      });
      cameraStreamRef.current = stream;
      if (localCameraRef.current) {
        localCameraRef.current.srcObject = stream;
      }
      setCameraEnabled(true);
      peerConnectionsRef.current.forEach((peer) => {
        attachCameraTracks(peer);
      });
    } catch (error) {
      const name = error?.name || "UnknownError";
      const message = error?.message || "Unknown reason";
      setCameraError(`ไม่สามารถเปิดกล้องได้: ${name} (${message})`);
    }
  };

  const handleStopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    peerConnectionsRef.current.forEach((peer) => {
      const sender = peer
        .getSenders()
        .find((item) => item.track && item.track.kind === "video");
      if (sender) {
        sender.replaceTrack(null).catch(() => {});
      }
    });
    const socket = getSocket();
    socket.emit("camera-stop", { roomId });
    if (localCameraRef.current) {
      localCameraRef.current.pause?.();
      localCameraRef.current.srcObject = null;
    }
    setCameraEnabled(false);
    setCameraError("");
  };

  const handleStartMic = async () => {
    setMicError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 24000
        }
      });
      micStreamRef.current = stream;
      setMicEnabled(true);
      startMicMonitor(stream);
      peerConnectionsRef.current.forEach((peer) => attachMicTracks(peer));
    } catch (error) {
      const name = error?.name || "UnknownError";
      const message = error?.message || "Unknown reason";
      setMicError(`ไม่สามารถเปิดไมค์ได้: ${name} (${message})`);
    }
  };

  const handleStopMic = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    micSendersRef.current.forEach((sender) => {
      sender.replaceTrack(null).catch(() => {});
    });
    setMicEnabled(false);
    setMicError("");
    stopMicMonitor();
  };

  const startMicMonitor = (stream) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      micAnalyserRef.current = { analyser, source };
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          sum += data[i];
        }
        const avg = sum / data.length;
        setIsSpeaking(avg > 18);
        micRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (error) {
      setIsSpeaking(false);
    }
  };

  const stopMicMonitor = () => {
    if (micRafRef.current) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = null;
    }
    if (micAnalyserRef.current) {
      micAnalyserRef.current.source.disconnect();
      micAnalyserRef.current = null;
    }
    setIsSpeaking(false);
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
    const videoEl = remoteVideoRef.current;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (videoEl?.requestFullscreen) {
      await videoEl.requestFullscreen();
      return;
    }
    if (videoEl?.webkitEnterFullscreen) {
      videoEl.webkitEnterFullscreen();
    }
  };

  const handleRefreshLive = () => {
    const socket = getSocket();
    peerConnectionsRef.current.forEach((peer) => peer.close());
    peerConnectionsRef.current.clear();
    micSendersRef.current.clear();
    setRemoteVideoStreams([]);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setHasRemoteStream(false);
    if (currentUser?.role === "Student") {
      setApproved(false);
    }

    if (!currentUser) return;
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

  return (
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
            <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-2xl border bg-gradient-to-br from-white gray-50 to-gray-100">
              <span className="absolute right-3 top-3 flex items-center gap-1">
                <span
                  className={`h-2.5 w-2.5 rounded-full border ${
                    networkStatus === "offline"
                      ? "border-rose-300 bg-rose-400"
                      : saveData || connectionType === "2g"
                      ? "border-amber-300 bg-amber-400"
                      : "border-emerald-300 bg-emerald-400"
                  }`}
                  title={
                    networkStatus === "offline"
                      ? "Network Bad"
                      : saveData || connectionType === "2g"
                      ? "Network Fair"
                      : "Network Good"
                  }
                />
              </span>
              {currentUser?.role === "Teacher" ? (
                <video
                  ref={localVideoRef}
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />
              ) : (
                <video
                  ref={remoteVideoRef}
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />
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
            {audioStreams.map((item) => (
              <AudioPlayer key={item.id} stream={item.stream} />
            ))}
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
                          speakingMap[entry.user?.name]
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
                            speakingMap[entry.user?.name]
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

            {currentUser?.role === "Teacher" && remoteVideoStreams.length > 0 && (
              <div className="mt-4 rounded-2xl border border-ink-900/10 bg-white/70 p-4">
                <p className="text-xs font-semibold text-ink-600">กล้องนักเรียน</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {remoteVideoStreams.map((item) => (
                    <RemoteVideo
                      key={item.id}
                      className="h-24 w-full rounded-xl object-cover"
                      stream={item.stream}
                    />
                  ))}
                </div>
              </div>
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
}
