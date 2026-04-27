import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createRoom, getRoom, deleteRoom, getRooms, extractVideoId, roomToJSON } from './rooms';
import { Song } from './types';
import { AccessToken } from 'livekit-server-sdk';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
  console.warn(
    'Warning: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL must be set for voice chat. ' +
    'The /api/livekit-token endpoint will be unavailable until these are configured.'
  );
}

// Room cleanup: delete rooms inactive for > 2 hours
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of getRooms()) {
    if (now - room.lastActivity > 2 * 60 * 60 * 1000) {
      io.to(code).emit('room:closed', { reason: 'inactivity' });
      deleteRoom(code);
    }
  }
}, 5 * 60 * 1000);

// REST: LiveKit token
app.get('/api/livekit-token', async (req, res) => {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    return res.status(503).json({ error: 'Voice chat is not configured on this server' });
  }
  const { roomCode, participantName, participantId } = req.query as Record<string, string>;
  if (!roomCode || !participantName || !participantId) {
    return res.status(400).json({ error: 'Missing params' });
  }
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantId,
    name: participantName,
  });
  at.addGrant({ roomJoin: true, room: roomCode, canPublish: true, canSubscribe: true });
  const token = await at.toJwt();
  res.json({ token, url: LIVEKIT_URL });
});

// REST: health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

io.on('connection', (socket) => {
  console.log('connected:', socket.id);

  socket.on('room:create', ({ playerName }: { playerName: string }) => {
    const room = createRoom(socket.id, playerName);
    socket.join(room.code);
    socket.emit('room:joined', { room: roomToJSON(room), playerId: socket.id });
  });

  socket.on('room:join', ({ code, playerName }: { code: string; playerName: string }) => {
    const room = getRoom(code);
    if (!room) {
      socket.emit('room:error', { message: 'Room not found' });
      return;
    }
    const player = { id: socket.id, name: playerName, score: 0, isHost: false };
    room.players.set(socket.id, player);
    room.lastActivity = Date.now();
    socket.join(room.code);
    socket.emit('room:joined', { room: roomToJSON(room), playerId: socket.id });
    io.to(room.code).emit('room:updated', { room: roomToJSON(room) });
  });

  socket.on('queue:add', ({ code, youtubeUrl }: { code: string; youtubeUrl: string }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      socket.emit('room:error', { message: 'Invalid YouTube URL' });
      return;
    }
    const song: Song = {
      id: `${Date.now()}-${Math.random()}`,
      youtubeUrl,
      videoId,
      title: `Song by ${player.name}`,
      addedBy: socket.id,
      addedByName: player.name,
    };
    room.queue.push(song);
    room.lastActivity = Date.now();
    io.to(room.code).emit('room:updated', { room: roomToJSON(room) });
  });

  socket.on('queue:remove', ({ code, songId }: { code: string; songId: string }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    // Only host or song adder can remove
    const idx = room.queue.findIndex(s => s.id === songId);
    if (idx === -1) return;
    const song = room.queue[idx];
    if (socket.id !== room.hostId && socket.id !== song.addedBy) return;
    room.queue.splice(idx, 1);
    io.to(room.code).emit('room:updated', { room: roomToJSON(room) });
  });

  socket.on('stage:start', ({ code }: { code: string }) => {
    const room = getRoom(code);
    if (!room || socket.id !== room.hostId) return;
    if (room.queue.length === 0) return;
    const song = room.queue.shift()!;
    room.currentSong = song;
    room.currentSingerId = song.addedBy;
    room.phase = 'stage';
    room.isPlaying = false;
    room.playerTime = 0;
    room.votes = new Map();
    room.lastActivity = Date.now();
    io.to(room.code).emit('room:updated', { room: roomToJSON(room) });
  });

  socket.on('player:play', ({ code, time }: { code: string; time: number }) => {
    const room = getRoom(code);
    if (!room) return;
    room.isPlaying = true;
    room.playerTime = time;
    room.lastActivity = Date.now();
    socket.to(room.code).emit('player:play', { time });
  });

  socket.on('player:pause', ({ code, time }: { code: string; time: number }) => {
    const room = getRoom(code);
    if (!room) return;
    room.isPlaying = false;
    room.playerTime = time;
    room.lastActivity = Date.now();
    socket.to(room.code).emit('player:pause', { time });
  });

  socket.on('player:seek', ({ code, time }: { code: string; time: number }) => {
    const room = getRoom(code);
    if (!room) return;
    room.playerTime = time;
    room.lastActivity = Date.now();
    socket.to(room.code).emit('player:seek', { time });
  });

  socket.on('stage:end', ({ code }: { code: string }) => {
    const room = getRoom(code);
    if (!room || socket.id !== room.hostId) return;
    room.phase = 'voting';
    room.isPlaying = false;
    room.lastActivity = Date.now();
    io.to(room.code).emit('room:updated', { room: roomToJSON(room) });
  });

  socket.on('vote:submit', ({ code, score }: { code: string; score: number }) => {
    const room = getRoom(code);
    if (!room || room.phase !== 'voting') return;
    if (socket.id === room.currentSingerId) return; // Singer can't vote for themselves
    if (score < 1 || score > 5) return;
    room.votes.set(socket.id, score);
    room.lastActivity = Date.now();
    io.to(room.code).emit('room:updated', { room: roomToJSON(room) });
  });

  socket.on('voting:end', ({ code }: { code: string }) => {
    const room = getRoom(code);
    if (!room || socket.id !== room.hostId) return;
    // Tally votes and award points
    if (room.votes.size > 0) {
      const total = Array.from(room.votes.values()).reduce((a, b) => a + b, 0);
      const avg = total / room.votes.size;
      const points = Math.round(avg * 20); // Max 100 points
      const singer = room.currentSingerId ? room.players.get(room.currentSingerId) : null;
      if (singer) {
        singer.score += points;
        room.players.set(singer.id, singer);
      }
    }
    room.phase = 'leaderboard';
    room.lastActivity = Date.now();
    io.to(room.code).emit('room:updated', { room: roomToJSON(room) });
  });

  socket.on('game:next', ({ code }: { code: string }) => {
    const room = getRoom(code);
    if (!room || socket.id !== room.hostId) return;
    room.currentSong = null;
    room.currentSingerId = null;
    room.phase = 'lobby';
    room.votes = new Map();
    room.lastActivity = Date.now();
    io.to(room.code).emit('room:updated', { room: roomToJSON(room) });
  });

  socket.on('disconnecting', () => {
    for (const roomCode of socket.rooms) {
      if (roomCode === socket.id) continue;
      const room = getRoom(roomCode);
      if (!room) continue;
      room.players.delete(socket.id);
      if (room.players.size === 0) {
        deleteRoom(roomCode);
        continue;
      }
      // Transfer host if needed
      if (room.hostId === socket.id) {
        const newHost = room.players.values().next().value;
        if (newHost) {
          newHost.isHost = true;
          room.hostId = newHost.id;
          room.players.set(newHost.id, newHost);
        }
      }
      io.to(roomCode).emit('room:updated', { room: roomToJSON(room) });
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
