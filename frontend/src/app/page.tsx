'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { Room } from '@/lib/types';

export default function Home() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = () => {
    if (!playerName.trim()) { setError('Enter your name'); return; }
    setLoading(true);
    const socket = getSocket();
    socket.emit('room:create', { playerName: playerName.trim() });
    socket.once('room:joined', ({ room, playerId }: { room: Room; playerId: string }) => {
      sessionStorage.setItem('playerId', playerId);
      sessionStorage.setItem('playerName', playerName.trim());
      router.push(`/room/${room.code}`);
    });
    socket.once('room:error', ({ message }: { message: string }) => {
      setError(message);
      setLoading(false);
    });
  };

  const handleJoin = () => {
    if (!playerName.trim()) { setError('Enter your name'); return; }
    if (!joinCode.trim()) { setError('Enter a room code'); return; }
    setLoading(true);
    const socket = getSocket();
    socket.emit('room:join', { code: joinCode.trim().toUpperCase(), playerName: playerName.trim() });
    socket.once('room:joined', ({ room, playerId }: { room: Room; playerId: string }) => {
      sessionStorage.setItem('playerId', playerId);
      sessionStorage.setItem('playerName', playerName.trim());
      router.push(`/room/${room.code}`);
    });
    socket.once('room:error', ({ message }: { message: string }) => {
      setError(message);
      setLoading(false);
    });
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-extrabold mb-3 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
            🎤 vcKaraoke
          </h1>
          <p className="text-gray-400 text-lg">Host the ultimate virtual karaoke night with friends!</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 shadow-xl border border-gray-800 space-y-4">
          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Your Name</label>
            <input
              className="w-full bg-gray-800 rounded-lg px-4 py-2 text-white placeholder-gray-600 border border-gray-700 focus:outline-none focus:border-purple-500"
              placeholder="Enter your name"
              value={playerName}
              onChange={e => { setPlayerName(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <button
            className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50"
            onClick={handleCreate}
            disabled={loading}
          >
            🎉 Create a Room
          </button>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-gray-700" />
            <span className="mx-3 text-gray-500 text-sm">or join existing</span>
            <div className="flex-grow border-t border-gray-700" />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Room Code</label>
            <input
              className="w-full bg-gray-800 rounded-lg px-4 py-2 text-white placeholder-gray-600 border border-gray-700 focus:outline-none focus:border-purple-500 uppercase tracking-widest"
              placeholder="e.g. KARAOK"
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              maxLength={6}
            />
          </div>

          <button
            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50"
            onClick={handleJoin}
            disabled={loading}
          >
            🚪 Join Room
          </button>
        </div>

        <p className="text-center text-gray-600 text-sm mt-6">
          Made with 🎵 by{' '}
          <a href="https://mario-belmonte.com" className="text-purple-400 hover:underline" target="_blank" rel="noopener noreferrer">
            mario-belmonte.com
          </a>
        </p>
      </div>
    </main>
  );
}
