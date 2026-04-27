'use client';
import { useEffect, useState, useRef } from 'react';
import {
  Room as LiveKitRoom,
  RoomEvent,
  LocalParticipant,
  RemoteTrack,
  Track,
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const roomRef = useRef<LiveKitRoom | null>(null);
  const localRef = useRef<LocalParticipant | null>(null);
  const audioElsRef = useRef<Map<string, HTMLMediaElement>>(new Map());

  const clearRemoteAudioElements = () => {
    for (const el of audioElsRef.current.values()) {
      el.remove();
    }
    audioElsRef.current.clear();
  };

  const connect = async () => {
    setConnecting(true);
    setErrorMessage(null);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(
        `${backendUrl}/api/livekit-token?roomCode=${roomCode}&participantName=${encodeURIComponent(playerName)}&participantId=${playerId}`
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to get voice token');
      }
      const { token, url } = await res.json() as { token: string; url: string };

      const lkRoom = new LiveKitRoom();
      roomRef.current = lkRoom;

      lkRoom.on(RoomEvent.ParticipantConnected, () => {
        setParticipantCount(lkRoom.remoteParticipants.size + 1);
      });
      lkRoom.on(RoomEvent.ParticipantDisconnected, () => {
        setParticipantCount(lkRoom.remoteParticipants.size + 1);
      });
      lkRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication) => {
        if (track.kind !== Track.Kind.Audio) return;
        if (!publication.trackSid) return;
        const mediaEl = track.attach() as HTMLMediaElement;
        mediaEl.autoplay = true;
        mediaEl.style.display = 'none';
        document.body.appendChild(mediaEl);
        audioElsRef.current.set(publication.trackSid, mediaEl);
      });
      lkRoom.on(RoomEvent.TrackUnsubscribed, (_track: RemoteTrack, publication) => {
        if (!publication.trackSid) return;
        const mediaEl = audioElsRef.current.get(publication.trackSid);
        if (mediaEl) {
          mediaEl.remove();
          audioElsRef.current.delete(publication.trackSid);
        }
      });
      lkRoom.on(RoomEvent.Disconnected, () => {
        clearRemoteAudioElements();
      });

      await lkRoom.connect(url, token);
      localRef.current = lkRoom.localParticipant;
      setParticipantCount(lkRoom.remoteParticipants.size + 1);
      setConnected(true);
      try {
        await lkRoom.localParticipant.setMicrophoneEnabled(true);
      } catch (micErr) {
        setMuted(true);
        setErrorMessage('Joined voice, but microphone access was blocked. Use the mute button to retry.');
        console.error('VoiceChat mic enable error:', micErr);
      }
    } catch (err) {
      console.error('VoiceChat connect error:', err);
      const message = err instanceof Error ? err.message : 'Unable to join voice';
      setErrorMessage(message);
      await roomRef.current?.disconnect();
      roomRef.current = null;
      localRef.current = null;
      clearRemoteAudioElements();
      setConnected(false);
      setMuted(false);
      setParticipantCount(0);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    localRef.current = null;
    clearRemoteAudioElements();
    setConnected(false);
    setMuted(false);
    setErrorMessage(null);
    setParticipantCount(0);
  };

  const toggleMute = async () => {
    if (!localRef.current) return;
    const newMuted = !muted;
    await localRef.current.setMicrophoneEnabled(!newMuted);
    setMuted(newMuted);
  };

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
      clearRemoteAudioElements();
    };
  }, []);

  if (!connected) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          onClick={connect}
          disabled={connecting}
          className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-sm px-3 py-1.5 rounded-lg border border-gray-700 transition-all disabled:opacity-50"
        >
          <span>{connecting ? '⏳' : '🎙️'}</span>
          <span>{connecting ? 'Connecting...' : 'Join Voice'}</span>
        </button>
        {errorMessage && <p className="text-xs text-red-400">{errorMessage}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
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
      {errorMessage && <p className="text-xs text-yellow-400">{errorMessage}</p>}
    </div>
  );
}
