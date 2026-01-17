import { Router } from "express";
import { AccessToken } from "livekit-server-sdk";
import { nanoid } from "nanoid";

const router = Router();

router.post("/livekit/token", async (req, res) => {
  const { roomId, user } = req.body || {};
  if (!roomId || !user?.name || !user?.role) {
    return res.status(400).json({ message: "Missing room or user" });
  }

  const { rooms, getRoomState, normalizeUserKey } = req.app.locals.store;
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ message: "Room not found" });
  }

  const state = getRoomState(roomId);
  if (user.role === "Student") {
    const userKey = normalizeUserKey(user);
    if (!userKey || !state.approvedUsers.has(userKey)) {
      return res.status(403).json({ message: "User not approved" });
    }
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !livekitUrl) {
    return res.status(500).json({ message: "LiveKit not configured" });
  }

  const identity = `${user.role}-${user.name}-${nanoid(6)}`;
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: user.name,
    metadata: user.role
  });
  token.addGrant({
    roomJoin: true,
    room: roomId,
    canPublish: true,
    canSubscribe: true
  });

  const jwt = await token.toJwt();
  res.json({ token: jwt, url: livekitUrl });
});

export default router;
