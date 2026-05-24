import express from "express";
import http from "http";
import { Server } from "socket.io";
import cron from "node-cron";
import mongoose from "mongoose";
import Redis from "ioredis";
import dotenv from "dotenv";
import Room from "./models/messages.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

// ─── MongoDB Connection ───────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB Error:", err));

// ─── Redis Connection ─────────────────────────────────────────────
const redis = new Redis(process.env.REDIS_URL);

redis.on("connect", () => console.log("Redis Connected"));
redis.on("error", (err) => console.error("Redis Error:", err));

// ─── Track online users per room ─────────────────────────────────
// Structure: { roomId: [ { socketId, username } ] }
const onlineUsers = {};

// ─── Socket.io ───────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("A User Connected", socket.id);

  // ── JOIN ──────────────────────────────────────────────────────
  socket.on("join", async ({ roomId, username }) => {
    socket.join(roomId);
    console.log(`${username} joined room: ${roomId}`);

    // Add user to the online users list for this room
    if (!onlineUsers[roomId]) {
      onlineUsers[roomId] = [];
    }

    // Avoid duplicates (e.g. on reconnect)
    onlineUsers[roomId] = onlineUsers[roomId].filter(
      (u) => u.socketId !== socket.id,
    );
    onlineUsers[roomId].push({ socketId: socket.id, username });

    // Broadcast updated online users to everyone in the room
    io.to(roomId).emit(
      "onlineUsers",
      onlineUsers[roomId].map((u) => u.username),
    );

    // Fetch message history from MongoDB for the joining user
    try {
      const room = await Room.findOne({ roomId });
      if (room && room.messages.length > 0) {
        socket.emit("history", room.messages);
        console.log(
          `Sent ${room.messages.length} messages history to ${socket.id}`,
        );
      }
    } catch (err) {
      console.error("Error fetching history from MongoDB:", err);
    }
  });

  // ── LEAVE ─────────────────────────────────────────────────────
  socket.on("leave", (roomId) => {
    socket.leave(roomId);
    console.log(`Socket ${socket.id} left room: ${roomId}`);

    // Remove user from online list
    if (onlineUsers[roomId]) {
      onlineUsers[roomId] = onlineUsers[roomId].filter(
        (u) => u.socketId !== socket.id,
      );

      // Broadcast updated online users to remaining members
      io.to(roomId).emit(
        "onlineUsers",
        onlineUsers[roomId].map((u) => u.username),
      );

      // Clean up empty rooms
      if (onlineUsers[roomId].length === 0) {
        delete onlineUsers[roomId];
      }
    }
  });

  // ── DISCONNECT (browser closed / lost connection) ─────────────
  socket.on("disconnect", () => {
    console.log("User Disconnected", socket.id);

    // Find which room this socket was in and remove them
    for (const roomId in onlineUsers) {
      const before = onlineUsers[roomId].length;
      onlineUsers[roomId] = onlineUsers[roomId].filter(
        (u) => u.socketId !== socket.id,
      );

      if (onlineUsers[roomId].length !== before) {
        // Broadcast updated list to remaining members
        io.to(roomId).emit(
          "onlineUsers",
          onlineUsers[roomId].map((u) => u.username),
        );

        // Clean up empty rooms
        if (onlineUsers[roomId].length === 0) {
          delete onlineUsers[roomId];
        }
        break;
      }
    }
  });

  // ── SEND ──────────────────────────────────────────────────────
  socket.on("send", async (message) => {
    console.log("Message received:", message);

    socket.to(message.room).emit("message", message);

    try {
      const redisKey = `room:${message.room}:messages`;
      const newMessage = {
        senderName: message.sender,
        message: message.text,
        timestamp: new Date().toISOString(),
      };

      await redis.rpush(redisKey, JSON.stringify(newMessage));
      await redis.expire(redisKey, 5400);

      console.log(`Message saved to Redis under key: ${redisKey}`);
    } catch (err) {
      console.error("Error saving message to Redis:", err);
    }
  });
});

// ─── Cron Job: Sync Redis → MongoDB every 5 minutes ──────────────
cron.schedule("*/5 * * * *", async () => {
  console.log("Cron job running: Syncing Redis → MongoDB...");

  try {
    const keys = await redis.keys("room:*:messages");

    if (keys.length === 0) {
      console.log("No Redis data to sync.");
      return;
    }

    for (const key of keys) {
      const roomId = key.split(":").slice(1, -1).join(":");
      const rawMessages = await redis.lrange(key, 0, -1);
      const messages = rawMessages.map((m) => JSON.parse(m));

      if (messages.length === 0) continue;

      await Room.findOneAndUpdate(
        { roomId },
        { $push: { messages: { $each: messages } } },
        { upsert: true, new: true },
      );

      await redis.del(key);
      console.log(
        `Synced ${messages.length} messages for room "${roomId}" to MongoDB`,
      );
    }
  } catch (err) {
    console.error("Error during cron sync:", err);
  }
});

// ─── Start Server ─────────────────────────────────────────────────
server.listen(5050, () => {
  console.log("Listening on *:5050");
});
