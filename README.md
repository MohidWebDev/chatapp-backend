# ChatApp — Backend

The backend of a real-time group chat application built with Node.js, Socket.io, MongoDB, and Redis.

## 🔗 Related Repository
- **Frontend:** https://github.com/MohidWebDev/chatapp-frontend.git

## ⚙️ Tech Stack
- Node.js + Express
- Socket.io
- MongoDB (Mongoose) — permanent message storage
- Redis (Upstash/ioredis) — temporary message cache with 1.5hr TTL
- node-cron — syncs Redis to MongoDB every 5 minutes

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/MohidWebDev/chatapp-backend.git
cd chatapp-backend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
Create a `.env` file in the root:
```env
MONGO_URI=your_mongodb_atlas_uri
REDIS_URL=your_upstash_redis_url
```

### 4. Run the server
```bash
npm start
```

Server runs on `http://localhost:5050`

## 🗄️ Data Flow
- Messages are saved to **Redis** instantly with a 1.5hr TTL
- A **cron job** runs every 5 minutes syncing Redis → MongoDB
- When a user joins a room, **message history** is fetched from MongoDB

## ✨ Features
- Real-time messaging with rooms (group isolation)
- Online/offline user tracking per room
- Message history on join
- Redis caching with TTL
- MongoDB persistent storage
- Automatic Redis → MongoDB sync via cron job