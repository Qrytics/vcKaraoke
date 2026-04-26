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

export default function Voting({ room, playerId, isHost, socket }: Props) {
  const [myVote, setMyVote] = useState<number>(0);
  const singer = room.players.find(p => p.id === room.currentSingerId);
  const isSinger = room.currentSingerId === playerId;
  const hasVoted = myVote > 0 || room.votes[playerId] !== undefined;
  const voteCount = Object.keys(room.votes).length;
  const eligibleVoters = room.players.filter(p => p.id !== room.currentSingerId).length;

  const submitVote = (score: number) => {
    if (isSinger || hasVoted) return;
    setMyVote(score);
    socket.emit('vote:submit', { code: room.code, score });
  };

  const endVoting = () => {
    socket.emit('voting:end', { code: room.code });
  };

  const stars = [1, 2, 3, 4, 5];
  const emojis = ['😬', '😐', '🙂', '😄', '🤩'];

  return (
    <div className="max-w-lg mx-auto p-4 md:p-6 space-y-6">
      <div className="text-center">
        <div className="text-6xl mb-3">👏</div>
        <h2 className="text-2xl font-bold">Rate the performance!</h2>
        <p className="text-gray-400 mt-1">
          <span className="text-purple-400 font-semibold">{singer?.name}</span> just sang!
        </p>
      </div>

      {/* Voting UI */}
      {!isSinger ? (
        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          {hasVoted ? (
            <div className="text-center py-4">
              <p className="text-2xl mb-2">{'⭐'.repeat(myVote || room.votes[playerId])}</p>
              <p className="text-green-400 font-semibold">Vote submitted!</p>
            </div>
          ) : (
            <div>
              <p className="text-center text-gray-400 mb-4">How was the performance?</p>
              <div className="flex justify-center gap-3">
                {stars.map(star => (
                  <button
                    key={star}
                    onClick={() => submitVote(star)}
                    className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-gray-800 transition-all"
                  >
                    <span className="text-2xl">{emojis[star - 1]}</span>
                    <span className="text-yellow-400 font-bold">{'★'.repeat(star)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 text-center">
          <div className="text-4xl mb-3 animate-spin">⏳</div>
          <p className="text-gray-400">Waiting for votes...</p>
        </div>
      )}

      {/* Vote progress */}
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
        <div className="flex justify-between text-sm text-gray-400 mb-2">
          <span>Votes received</span>
          <span>{voteCount} / {eligibleVoters}</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-pink-500 to-purple-500 h-2 rounded-full transition-all"
            style={{ width: `${eligibleVoters > 0 ? (voteCount / eligibleVoters) * 100 : 0}%` }}
          />
        </div>
      </div>

      {isHost && (
        <button
          className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold py-3 rounded-lg transition-all"
          onClick={endVoting}
        >
          📊 Show Results
        </button>
      )}
    </div>
  );
}
