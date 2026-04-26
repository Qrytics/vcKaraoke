export interface Player {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
}

export interface Song {
  id: string;
  youtubeUrl: string;
  videoId: string;
  title: string;
  addedBy: string;
  addedByName: string;
}

export interface Room {
  code: string;
  players: Map<string, Player>;
  queue: Song[];
  currentSong: Song | null;
  currentSingerId: string | null;
  hostId: string;
  playerTime: number;
  isPlaying: boolean;
  phase: 'lobby' | 'stage' | 'voting' | 'leaderboard';
  votes: Map<string, number>; // voterId -> score
  lastActivity: number;
}
