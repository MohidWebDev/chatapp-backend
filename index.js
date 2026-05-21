import { Socket } from "engine.io";
import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("A User Connected", socket.id);

  socket.on("join", (roomId) => {
    socket.join(roomId);
  });

  socket.on("leave", (roomId) => {
    socket.leave(roomId);
  });

  socket.on("send", (message) => {
    console.log(message);
    socket.to(message.room).emit("message", message);
  });
});

server.listen(5050, () => {
  console.log("Listening on *:5050");
});
