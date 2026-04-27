'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { Room } from '@/lib/types';
import Lobby from '@/components/Lobby';
import Stage from '@/components/Stage';
import Voting from '@/components/Voting';
import Leaderboard from '@/components/Leaderboard';
import VoiceChat from '@/components/VoiceChat';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();
  const [room, setRoom] = useState<Room | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(getSocket());

  useEffect(() => {
    const socket = socketRef.current;
    const storedId = sessionStorage.getItem('playerId') || '';
    const storedName = sessionStorage.getItem('playerName') || 'Guest';
    setPlayerId(storedId);

    // If we have a stored session, try to re-join
    if (storedId) {
      socket.emit('room:join', { code, playerName: storedName });
    }

    socket.on('room:joined', ({ room: r, playerId: pid }: { room: Room; playerId: string }) => {
      setRoom(r);
      setPlayerId(pid);
      sessionStorage.setItem('playerId', pid);
      setConnected(true);
    });

    socket.on('room:updated', ({ room: r }: { room: Room }) => {
      setRoom(r);
    });

    socket.on('room:error', ({ message }: { message: string }) => {
      setError(message);
    });

    socket.on('room:closed', () => {
      router.push('/');
    });

    return () => {
      socket.off('room:joined');
      socket.off('room:updated');
      socket.off('room:error');
      socket.off('room:closed');
    };
  }, [code, router]);

  useEffect(() => {
    const socket = socketRef.current;
    const emitPing = () => socket.emit('latency:ping', { code, sentAt: Date.now() });
    emitPing();
    const interval = setInterval(emitPing, 5000);
    return () => clearInterval(interval);
  }, [code]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">{error}</p>
          <button onClick={() => router.push('/')} className="bg-purple-600 hover:bg-purple-500 px-6 py-2 rounded-lg">
            Go Home
          </button>
        </div>
      </main>
    );
  }

  if (!room || !connected) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce">🎤</div>
          <p className="text-gray-400">Connecting to room {code}...</p>
        </div>
      </main>
    );
  }

  const socket = socketRef.current;
  const isHost = room.hostId === playerId;
  const playerName = sessionStorage.getItem('playerName') || 'Guest';

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">🎤 vcKaraoke</span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400 font-mono tracking-widest text-sm">{code}</span>
        </div>
        <div className="flex items-center gap-3">
          <VoiceChat roomCode={code} playerId={playerId} playerName={playerName} />
          <span className="text-sm text-gray-400">{room.players.length} player{room.players.length !== 1 ? 's' : ''}</span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {room.phase === 'lobby' && (
          <Lobby room={room} playerId={playerId} isHost={isHost} socket={socket} />
        )}
        {room.phase === 'stage' && (
          <Stage room={room} playerId={playerId} isHost={isHost} socket={socket} />
        )}
        {room.phase === 'voting' && (
          <Voting room={room} playerId={playerId} isHost={isHost} socket={socket} />
        )}
        {room.phase === 'leaderboard' && (
          <Leaderboard room={room} playerId={playerId} isHost={isHost} socket={socket} />
        )}
      </div>
    </main>
  );
}
