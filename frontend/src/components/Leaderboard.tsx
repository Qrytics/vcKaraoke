'use client';
import { Socket } from 'socket.io-client';
import { Room } from '@/lib/types';

interface Props {
  room: Room;
  playerId: string;
  isHost: boolean;
  socket: Socket;
}

export default function Leaderboard({ room, playerId, isHost, socket }: Props) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const singer = room.players.find(p => p.id === room.currentSingerId);
  const voteValues = Object.values(room.votes);
  const avgScore = voteValues.length > 0
    ? (voteValues.reduce((a, b) => a + b, 0) / voteValues.length).toFixed(1)
    : '—';
  const earnedPoints = voteValues.length > 0
    ? Math.round((voteValues.reduce((a, b) => a + b, 0) / voteValues.length) * 20)
    : 0;

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="max-w-lg mx-auto p-4 md:p-6 space-y-6">
      <div className="text-center">
        <div className="text-5xl mb-3">🏆</div>
        <h2 className="text-2xl font-bold">Leaderboard</h2>
        {singer && (
          <p className="text-gray-400 mt-1">
            <span className="text-purple-400 font-semibold">{singer.name}</span> earned{' '}
            <span className="text-yellow-400 font-bold">+{earnedPoints} pts</span>{' '}
            (avg {avgScore} ⭐)
          </p>
        )}
      </div>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        {sorted.map((player, idx) => (
          <div
            key={player.id}
            className={`flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0
              ${player.id === playerId ? 'bg-purple-900/20' : ''}`}
          >
            <span className="text-xl w-6 text-center">{medals[idx] || `${idx + 1}`}</span>
            <div className="flex-1">
              <span className={`font-semibold ${player.id === playerId ? 'text-purple-400' : 'text-white'}`}>
                {player.name} {player.id === playerId && '(you)'}
              </span>
              {player.isHost && <span className="ml-2 text-xs text-gray-500">👑 host</span>}
            </div>
            <span className="text-yellow-400 font-bold">{player.score} pts</span>
          </div>
        ))}
      </div>

      {isHost && (
        <div className="space-y-3">
          {room.queue.length > 0 ? (
            <button
              className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold py-3 rounded-lg"
              onClick={() => socket.emit('stage:start', { code: room.code })}
            >
              🎤 Next Singer ({room.queue.length} in queue)
            </button>
          ) : (
            <button
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg"
              onClick={() => socket.emit('game:next', { code: room.code })}
            >
              🎉 Back to Lobby
            </button>
          )}
        </div>
      )}
      {!isHost && (
        <p className="text-center text-gray-500 text-sm">Waiting for host to continue...</p>
      )}
    </div>
  );
}
