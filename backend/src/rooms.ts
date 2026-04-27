import { Room, Player, Song } from './types';

const rooms = new Map<string, Room>();

export function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateCode() : code;
}

export function createRoom(hostId: string, hostName: string): Room {
  const code = generateCode();
  const host: Player = { id: hostId, name: hostName, score: 0, isHost: true };
  const room: Room = {
    code,
    players: new Map([[hostId, host]]),
    queue: [],
    currentSong: null,
    currentSingerId: null,
    hostId,
    playerTime: 0,
    isPlaying: false,
    phase: 'lobby',
    votes: new Map(),
    latencyRttMs: new Map([[hostId, 120]]),
    playbackOffsetsMs: new Map([[hostId, 0]]),
    lastActivity: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function deleteRoom(code: string): void {
  rooms.delete(code);
}

export function getRooms(): Map<string, Room> {
  return rooms;
}

export function extractVideoId(url: string): string | null {
  const validId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  };

  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return validId(id);
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        return validId(parsed.searchParams.get('v'));
      }
      if (parsed.pathname.startsWith('/embed/')) {
        const id = parsed.pathname.split('/')[2];
        return validId(id);
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        const id = parsed.pathname.split('/')[2];
        return validId(id);
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function roomToJSON(room: Room) {
  return {
    code: room.code,
    players: Array.from(room.players.values()),
    queue: room.queue,
    currentSong: room.currentSong,
    currentSingerId: room.currentSingerId,
    hostId: room.hostId,
    playerTime: room.playerTime,
    isPlaying: room.isPlaying,
    phase: room.phase,
    votes: Object.fromEntries(room.votes),
    playbackOffsetsMs: Object.fromEntries(room.playbackOffsetsMs),
  };
}
