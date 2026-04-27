import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createRoom, getRoom, deleteRoom, getRooms, extractVideoId, roomToJSON } from './rooms';
import { Room, Song } from './types';
import { AccessToken } from 'livekit-server-sdk';
import { YoutubeTranscript } from 'youtube-transcript';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function fetchYouTubeVideoTitle(youtubeUrl: string): Promise<string | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`;
    const res = await fetch(oembedUrl);
    if (!res.ok) return null;
    const data = await res.json() as { title?: string };
    return data.title?.trim() || null;
  } catch {
    return null;
  }
}

function parseSongAndArtist(videoTitle: string): { songName?: string; artistName?: string } {
  const cleaned = videoTitle
    .replace(/\[[^\]]*]/g, '')
    .replace(/\([^)]*(official|audio|video|lyrics|mv|hd|4k)[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const dashParts = cleaned.split(' - ').map(p => p.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    return { artistName: dashParts[0], songName: dashParts.slice(1).join(' - ') };
  }

  const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return { songName: byMatch[1].trim(), artistName: byMatch[2].trim() };
  }

  return {};
}

function normalizeLyricText(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r/g, '')
    .trim();
}

async function fetchLyrics(
  videoId: string,
  songName?: string,
  artistName?: string
): Promise<{ lyrics: string; source: 'youtube_transcript' | 'lyrics_search' | 'none' }> {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    const transcriptLines = transcript
      .map((line) => normalizeLyricText(line.text))
      .filter((line) => line.length > 0);
    if (transcriptLines.length > 0) {
      return { lyrics: transcriptLines.join('\n'), source: 'youtube_transcript' };
    }
  } catch {
    // Continue to lyric fallback.
  }

  if (songName && artistName) {
    try {
      const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artistName)}/${encodeURIComponent(songName)}`);
      if (res.ok) {
        const payload = await res.json() as { lyrics?: string };
        const lyrics = normalizeLyricText(payload.lyrics || '');
        if (lyrics) {
          return { lyrics, source: 'lyrics_search' };
        }
      }
    } catch {
      // Fallback below.
    }
  }

  return { lyrics: 'Unable to find lyrics', source: 'none' };
}

function recomputePlaybackOffsets(room: Room): void {
  const singerId = room.currentSingerId;
  if (!singerId) {
    room.playbackOffsetsMs = new Map();
    for (const playerId of room.players.keys()) {
      room.playbackOffsetsMs.set(playerId, 0);
    }
    return;
  }

  const singerRtt = room.latencyRttMs.get(singerId) ?? 120;
  const singerUpstreamMs = singerRtt / 2;
  const safetyMs = 60;
  const offsets = new Map<string, number>();

  for (const playerId of room.players.keys()) {
    if (playerId === singerId) {
      offsets.set(playerId, 0);
      continue;
    }
    const audienceRtt = room.latencyRttMs.get(playerId) ?? 120;
    const audienceDownstreamMs = audienceRtt / 2;
    const offsetMs = clamp(Math.round(singerUpstreamMs + audienceDownstreamMs + safetyMs), 120, 900);
    offsets.set(playerId, offsetMs);
  }

  room.playbackOffsetsMs = offsets;
}

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

// REST: lyrics lookup
app.get('/api/lyrics', async (req, res) => {
  const { videoId, songName, artistName } = req.query as Record<string, string>;
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid videoId' });
  }

  const lyricsResult = await fetchLyrics(
    videoId,
    songName?.trim() || undefined,
    artistName?.trim() || undefined
  );
  res.json(lyricsResult);
});

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
    room.latencyRttMs.set(socket.id, 120);
    room.playbackOffsetsMs.set(socket.id, 0);
    if (room.phase === 'stage') {
      recomputePlaybackOffsets(room);
    }
    room.lastActivity = Date.now();
    socket.join(room.code);
    socket.emit('room:joined', { room: roomToJSON(room), playerId: socket.id });
    io.to(room.code).emit('room:updated', { room: roomToJSON(room) });
  });

  socket.on('latency:ping', ({ code, sentAt }: { code: string; sentAt: number }) => {
    const room = getRoom(code);
    if (!room || !room.players.has(socket.id)) return;
    const rttMs = clamp(Date.now() - sentAt, 20, 2000);
    room.latencyRttMs.set(socket.id, rttMs);
    if (room.phase === 'stage') {
      recomputePlaybackOffsets(room);
      io.to(room.code).emit('room:updated', { room: roomToJSON(room) });
    }
    socket.emit('latency:pong', { sentAt, serverAt: Date.now() });
  });

  socket.on('queue:add', async ({ code, youtubeUrl }: { code: string; youtubeUrl: string }) => {
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      socket.emit('room:error', { message: 'Invalid YouTube URL' });
      return;
    }
    const videoTitle = await fetchYouTubeVideoTitle(youtubeUrl) || 'YouTube video';
    const { songName, artistName } = parseSongAndArtist(videoTitle);

    const song: Song = {
      id: `${Date.now()}-${Math.random()}`,
      youtubeUrl,
      videoId,
      title: videoTitle,
      songName,
      artistName,
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
    recomputePlaybackOffsets(room);
    room.lastActivity = Date.now();
    io.to(room.code).emit('room:updated', { room: roomToJSON(room) });
  });

  socket.on('player:play', ({ code, time }: { code: string; time: number }) => {
    const room = getRoom(code);
    if (!room || socket.id !== room.currentSingerId) return;
    room.isPlaying = true;
    room.playerTime = time;
    room.lastActivity = Date.now();
    socket.to(room.code).emit('player:play', { time });
  });

  socket.on('player:pause', ({ code, time }: { code: string; time: number }) => {
    const room = getRoom(code);
    if (!room || socket.id !== room.currentSingerId) return;
    room.isPlaying = false;
    room.playerTime = time;
    room.lastActivity = Date.now();
    socket.to(room.code).emit('player:pause', { time });
  });

  socket.on('player:seek', ({ code, time }: { code: string; time: number }) => {
    const room = getRoom(code);
    if (!room || socket.id !== room.currentSingerId) return;
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
      room.latencyRttMs.delete(socket.id);
      room.playbackOffsetsMs.delete(socket.id);
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
      if (room.phase === 'stage') {
        recomputePlaybackOffsets(room);
      }
      io.to(roomCode).emit('room:updated', { room: roomToJSON(room) });
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
