'use client';
import { useEffect, useState, useRef } from 'react';
import {
  Room as LiveKitRoom,
  RoomEvent,
  LocalParticipant,
} from 'livekit-client';

interface Props {
  roomCode: string;
  playerId: string;
  playerName: string;
}

export default function VoiceChat({ roomCode, playerId, playerName }: Props) {
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const roomRef = useRef<LiveKitRoom | null>(null);
  const localRef = useRef<LocalParticipant | null>(null);

  const connect = async () => {
    setConnecting(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(
        `${backendUrl}/api/livekit-token?roomCode=${roomCode}&participantName=${encodeURIComponent(playerName)}&participantId=${playerId}`
      );
      if (!res.ok) throw new Error('Failed to get token');
      const { token, url } = await res.json() as { token: string; url: string };

      const lkRoom = new LiveKitRoom();
      roomRef.current = lkRoom;

      lkRoom.on(RoomEvent.ParticipantConnected, () => {
        setParticipantCount(lkRoom.remoteParticipants.size + 1);
      });
      lkRoom.on(RoomEvent.ParticipantDisconnected, () => {
        setParticipantCount(lkRoom.remoteParticipants.size + 1);
      });

      await lkRoom.connect(url, token);
      await lkRoom.localParticipant.setMicrophoneEnabled(true);
      localRef.current = lkRoom.localParticipant;
      setParticipantCount(lkRoom.remoteParticipants.size + 1);
      setConnected(true);
    } catch (err) {
      console.error('VoiceChat connect error:', err);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    localRef.current = null;
    setConnected(false);
    setMuted(false);
    setParticipantCount(0);
  };

  const toggleMute = async () => {
    if (!localRef.current) return;
    const newMuted = !muted;
    await localRef.current.setMicrophoneEnabled(!newMuted);
    setMuted(newMuted);
  };

  useEffect(() => {
    return () => { roomRef.current?.disconnect(); };
  }, []);

  if (!connected) {
    return (
      <button
        onClick={connect}
        disabled={connecting}
        className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-sm px-3 py-1.5 rounded-lg border border-gray-700 transition-all disabled:opacity-50"
      >
        <span>{connecting ? '⏳' : '🎙️'}</span>
        <span>{connecting ? 'Connecting...' : 'Join Voice'}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 bg-green-900/40 border border-green-700/50 text-sm px-3 py-1.5 rounded-lg">
        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-green-400 text-xs">{participantCount} in voice</span>
      </div>
      <button
        onClick={toggleMute}
        className={`text-sm px-3 py-1.5 rounded-lg border transition-all ${
          muted
            ? 'bg-red-900/40 border-red-700/50 text-red-400'
            : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
        }`}
      >
        {muted ? '🔇 Muted' : '🎙️ Live'}
      </button>
      <button
        onClick={disconnect}
        className="text-xs text-gray-600 hover:text-red-400 px-1"
        title="Leave voice"
      >
        ✕
      </button>
    </div>
  );
}
