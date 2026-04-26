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
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
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
  };
}
