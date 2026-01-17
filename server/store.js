export const rooms = new Map();
export const roomState = new Map();
export const filesByRoom = new Map();

export const normalizeUserKey = (user) => {
  if (!user?.name) return null;
  const key = user.name.trim().toLowerCase();
  return key.length > 0 ? key : null;
};

export const getRoomState = (roomId) => {
  if (!roomState.has(roomId)) {
    roomState.set(roomId, {
      teacherSocketId: null,
      pending: new Map(),
      approved: new Map(),
      approvedUsers: new Set(),
      messages: []
    });
  }
  return roomState.get(roomId);
};

export const getRoomFiles = (roomId) => {
  if (!filesByRoom.has(roomId)) {
    filesByRoom.set(roomId, []);
  }
  return filesByRoom.get(roomId);
};

export const emitApprovedList = (io, roomId) => {
  const state = roomState.get(roomId);
  if (!state) return;
  io.to(roomId).emit("approved-list", {
    approved: Array.from(state.approved.values())
  });
};
