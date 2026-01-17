export const registerSocketHandlers = (io, deps) => {
  const {
    rooms,
    roomState,
    filesByRoom,
    getRoomState,
    normalizeUserKey,
    emitApprovedList,
    updateRoleMetrics,
    updateRoomsMetric
  } = deps;

  io.on("connection", (socket) => {
    console.log(`[SOCKET] connected ${socket.id}`);
    updateRoleMetrics();

    socket.on("join-room", ({ roomId, user }) => {
      console.log(`[SOCKET] join-room ${roomId} by ${user?.name} (${user?.role})`);
      const room = rooms.get(roomId);
      if (!room || user?.role !== "Teacher") return;

      const state = getRoomState(roomId);
      state.teacherSocketId = socket.id;

      socket.join(roomId);
      socket.emit("chat-history", { messages: state.messages });
      socket.emit("pending-list", {
        pending: Array.from(state.pending.values())
      });
      emitApprovedList(io, roomId);
      updateRoleMetrics();
    });

    socket.on("request-join", ({ roomId, user }) => {
      console.log(`[SOCKET] request-join ${roomId} by ${user?.name}`);
      const room = rooms.get(roomId);
      if (!room || user?.role !== "Student") return;

      const state = getRoomState(roomId);
      const userKey = normalizeUserKey(user);
      if (userKey && state.approvedUsers.has(userKey)) {
        socket.join(roomId);
        state.approved.set(socket.id, { socketId: socket.id, user });
        socket.emit("join-approved", { roomId });
        socket.emit("chat-history", { messages: state.messages });
        if (state.teacherSocketId) {
          io.to(state.teacherSocketId).emit("student-approved", {
            roomId,
            socketId: socket.id,
            user,
            autoApproved: true
          });
        }
        emitApprovedList(io, roomId);
        updateRoleMetrics();
        return;
      }
      const request = {
        socketId: socket.id,
        user
      };

      state.pending.set(socket.id, request);

      if (state.teacherSocketId) {
        io.to(state.teacherSocketId).emit("join-request", {
          pending: Array.from(state.pending.values())
        });
      }
    });

    socket.on("approve-join", ({ roomId, socketId }) => {
      console.log(`[SOCKET] approve-join ${roomId} for ${socketId}`);
      const state = getRoomState(roomId);
      if (state.teacherSocketId !== socket.id) return;

      const request = state.pending.get(socketId);
      if (!request) return;

      state.pending.delete(socketId);
      const userKey = normalizeUserKey(request.user);
      if (userKey) {
        state.approvedUsers.add(userKey);
      }
      state.approved.set(socketId, request);
      const studentSocket = io.sockets.sockets.get(socketId);
      if (studentSocket) {
        studentSocket.join(roomId);
        studentSocket.emit("join-approved", { roomId });
        studentSocket.emit("chat-history", { messages: state.messages });
      }
      updateRoleMetrics();

      io.to(state.teacherSocketId).emit("join-request", {
        pending: Array.from(state.pending.values())
      });
      io.to(state.teacherSocketId).emit("student-approved", {
        roomId,
        socketId,
        user: request.user,
        autoApproved: false
      });
      emitApprovedList(io, roomId);
    });

    socket.on("chat-message", ({ roomId, message, user }) => {
      console.log(`[SOCKET] chat-message ${roomId} by ${user?.name}`);
      if (!roomId || !message || !user) return;
      if (!socket.rooms.has(roomId)) return;

      const state = getRoomState(roomId);
      const payload = {
        user,
        message,
        timestamp: new Date().toISOString()
      };
      state.messages.push(payload);
      io.to(roomId).emit("chat-message", payload);
    });

    socket.on("close-class", ({ roomId }) => {
      console.log(`[SOCKET] close-class ${roomId}`);
      if (!roomId) return;
      const state = getRoomState(roomId);
      if (state.teacherSocketId !== socket.id) return;
      io.to(roomId).emit("class-closed", { roomId });
      rooms.delete(roomId);
      roomState.delete(roomId);
      filesByRoom.delete(roomId);
      updateRoomsMetric();
      updateRoleMetrics();
      io.emit("room-removed", { roomId });
    });

    socket.on("disconnect", () => {
      console.log(`[SOCKET] disconnected ${socket.id}`);
      roomState.forEach((state) => {
        if (state.teacherSocketId === socket.id) {
          state.teacherSocketId = null;
        }
        if (state.pending.has(socket.id)) {
          state.pending.delete(socket.id);
        }
        if (state.approved.has(socket.id)) {
          state.approved.delete(socket.id);
        }
      });
      updateRoleMetrics();
      roomState.forEach((_, roomId) => {
        emitApprovedList(io, roomId);
      });
    });
  });
};
