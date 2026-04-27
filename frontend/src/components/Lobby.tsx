'use client';
import { useState } from 'react';
import { Socket } from 'socket.io-client';
import { Room } from '@/lib/types';

interface Props {
  room: Room;
  playerId: string;
  isHost: boolean;
  socket: Socket;
}

export default function Lobby({ room, playerId, isHost, socket }: Props) {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  const isValidYouTubeUrl = (input: string): boolean => {
    try {
      const parsed = new URL(input.trim());
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
      const validId = (id: string | null) => !!id && /^[A-Za-z0-9_-]{11}$/.test(id);

      if (host === 'youtu.be') {
        const id = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
        return validId(id);
      }

      if (host === 'youtube.com' || host === 'm.youtube.com') {
        if (parsed.pathname === '/watch') return validId(parsed.searchParams.get('v'));
        if (parsed.pathname.startsWith('/embed/')) {
          const id = parsed.pathname.split('/')[2] ?? null;
          return validId(id);
        }
        if (parsed.pathname.startsWith('/shorts/')) {
          const id = parsed.pathname.split('/')[2] ?? null;
          return validId(id);
        }
      }
    } catch {
      return false;
    }
    return false;
  };

  const addSong = () => {
    if (!youtubeUrl.trim()) { setUrlError('Enter a YouTube URL'); return; }
    if (!isValidYouTubeUrl(youtubeUrl)) {
      setUrlError('Please enter a valid YouTube video link');
      return;
    }
    setUrlError('');
    socket.emit('queue:add', { code: room.code, youtubeUrl: youtubeUrl.trim() });
    setYoutubeUrl('');
    socket.once('room:error', ({ message }: { message: string }) => setUrlError(message));
  };

  const removeSong = (songId: string) => {
    socket.emit('queue:remove', { code: room.code, songId });
  };

  const startSinging = () => {
    socket.emit('stage:start', { code: room.code });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Players */}
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <span>👥</span> Players ({room.players.length})
        </h2>
        <ul className="space-y-2">
          {room.players.map(p => (
            <li key={p.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{p.isHost ? '👑' : '🎤'}</span>
                <span className={p.id === playerId ? 'text-purple-400 font-semibold' : 'text-white'}>
                  {p.name} {p.id === playerId && '(you)'}
                </span>
              </div>
              <span className="text-yellow-400 font-bold text-sm">{p.score} pts</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 p-3 bg-gray-800 rounded-lg">
          <p className="text-xs text-gray-500">Room Code</p>
          <p className="font-mono text-2xl tracking-widest text-purple-400 font-bold">{room.code}</p>
          <p className="text-xs text-gray-600 mt-1">Share this code with friends!</p>
        </div>
      </div>

      {/* Queue */}
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <span>🎵</span> Song Queue ({room.queue.length})
        </h2>

        {/* Add song */}
        <div className="mb-4 space-y-2">
          <input
            className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 border border-gray-700 focus:outline-none focus:border-purple-500"
            placeholder="Paste YouTube URL..."
            value={youtubeUrl}
            onChange={e => { setYoutubeUrl(e.target.value); setUrlError(''); }}
            onKeyDown={e => e.key === 'Enter' && addSong()}
          />
          {urlError && <p className="text-red-400 text-xs">{urlError}</p>}
          <button
            className="w-full bg-purple-700 hover:bg-purple-600 text-white text-sm font-bold py-2 rounded-lg transition-all"
            onClick={addSong}
          >
            ➕ Add to Queue
          </button>
        </div>

        {/* Queue list */}
        {room.queue.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-6">No songs queued yet. Add one above!</p>
        ) : (
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {room.queue.map((song, idx) => {
              const headline = song.songName && song.artistName
                ? `${song.songName} by ${song.artistName}`
                : song.title;
              return (
                <li key={song.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-gray-500 text-sm w-5">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{headline}</p>
                    <p className="text-xs text-gray-500">queued by {song.addedByName}</p>
                  </div>
                  {(isHost || song.addedBy === playerId) && (
                    <button
                      onClick={() => removeSong(song.id)}
                      className="text-red-500 hover:text-red-400 text-xs flex-shrink-0"
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {isHost && room.queue.length > 0 && (
          <button
            className="w-full mt-4 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold py-3 rounded-lg transition-all"
            onClick={startSinging}
          >
            🎤 Start Singing!
          </button>
        )}
        {isHost && room.queue.length === 0 && (
          <p className="text-center text-gray-600 text-sm mt-4">Add songs to the queue to start!</p>
        )}
        {!isHost && (
          <p className="text-center text-gray-600 text-sm mt-4">Waiting for the host to start...</p>
        )}
      </div>
    </div>
  );
}
