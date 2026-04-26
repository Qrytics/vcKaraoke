'use client';
import { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { Room } from '@/lib/types';

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        options: {
          videoId: string;
          events: {
            onReady?: (event: { target: YouTubePlayer }) => void;
            onStateChange?: (event: { data: number }) => void;
          };
          playerVars?: Record<string, unknown>;
        }
      ) => YouTubePlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
        BUFFERING: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (time: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

interface Props {
  room: Room;
  playerId: string;
  isHost: boolean;
  socket: Socket;
}

export default function Stage({ room, playerId, isHost, socket }: Props) {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const isSyncing = useRef(false);
  const isSinger = room.currentSingerId === playerId;

  useEffect(() => {
    if (!room.currentSong) return;

    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    window.onYouTubeIframeAPIReady = initPlayer;
    if (window.YT?.Player) initPlayer();

    function initPlayer() {
      if (!room.currentSong) return;
      if (playerRef.current) {
        playerRef.current.destroy();
      }
      playerRef.current = new window.YT.Player('yt-player', {
        videoId: room.currentSong.videoId,
        playerVars: { autoplay: 0, controls: isSinger ? 1 : 0, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => {
            setPlayerReady(true);
            if (room.playerTime > 0) e.target.seekTo(room.playerTime, true);
          },
          onStateChange: (e) => {
            if (isSyncing.current) return;
            const state = window.YT.PlayerState;
            const time = playerRef.current!.getCurrentTime();
            if (e.data === state.PLAYING) {
              socket.emit('player:play', { code: room.code, time });
            } else if (e.data === state.PAUSED) {
              socket.emit('player:pause', { code: room.code, time });
            } else if (e.data === state.ENDED && isHost) {
              socket.emit('stage:end', { code: room.code });
            }
          },
        },
      });
    }

    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.currentSong?.videoId]);

  useEffect(() => {
    socket.on('player:play', ({ time }: { time: number }) => {
      if (!playerRef.current || !playerReady) return;
      isSyncing.current = true;
      const currentTime = playerRef.current.getCurrentTime();
      if (Math.abs(currentTime - time) > 2) {
        playerRef.current.seekTo(time, true);
      }
      playerRef.current.playVideo();
      setTimeout(() => { isSyncing.current = false; }, 500);
    });

    socket.on('player:pause', ({ time }: { time: number }) => {
      if (!playerRef.current || !playerReady) return;
      isSyncing.current = true;
      playerRef.current.seekTo(time, true);
      playerRef.current.pauseVideo();
      setTimeout(() => { isSyncing.current = false; }, 500);
    });

    socket.on('player:seek', ({ time }: { time: number }) => {
      if (!playerRef.current || !playerReady) return;
      playerRef.current.seekTo(time, true);
    });

    return () => {
      socket.off('player:play');
      socket.off('player:pause');
      socket.off('player:seek');
    };
  }, [socket, playerReady]);

  const singer = room.players.find(p => p.id === room.currentSingerId);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      {/* Singer info */}
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🎤</span>
          <div>
            <p className="text-sm text-gray-500">Now singing</p>
            <p className="font-bold text-xl text-purple-400">{singer?.name || 'Unknown'}</p>
          </div>
        </div>
        {isHost && (
          <button
            className="bg-red-700 hover:bg-red-600 text-white text-sm font-bold px-4 py-2 rounded-lg"
            onClick={() => socket.emit('stage:end', { code: room.code })}
          >
            ⏹ End Performance
          </button>
        )}
      </div>

      {/* YouTube Player */}
      <div className="relative bg-black rounded-2xl overflow-hidden aspect-video border border-gray-800">
        <div id="yt-player" className="w-full h-full" />
        {!playerReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <div className="text-4xl mb-2 animate-bounce">🎵</div>
              <p className="text-gray-400">Loading video...</p>
            </div>
          </div>
        )}
        {!isSinger && playerReady && (
          <div className="absolute bottom-2 right-2 bg-black/60 text-xs text-gray-400 px-2 py-1 rounded">
            Synced with {singer?.name}
          </div>
        )}
      </div>

      {/* Song info */}
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
        <p className="text-sm text-gray-500">Current song</p>
        <p className="text-white font-medium">{room.currentSong?.title}</p>
        <a href={room.currentSong?.youtubeUrl} target="_blank" rel="noopener noreferrer"
          className="text-xs text-purple-400 hover:underline">
          {room.currentSong?.youtubeUrl}
        </a>
      </div>

      {/* Queue preview */}
      {room.queue.length > 0 && (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
          <p className="text-sm text-gray-500 mb-2">Up next ({room.queue.length})</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {room.queue.slice(0, 5).map(song => (
              <div key={song.id} className="flex-shrink-0 bg-gray-800 rounded-lg px-3 py-1 text-xs text-gray-300">
                🎵 {song.addedByName}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
