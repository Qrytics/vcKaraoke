# 🎤 vcKaraoke

Host the ultimate virtual karaoke night! Connect with friends via access codes, queue any YouTube song, and compete with an integrated point system. Built with low-latency in-game voice chat to eliminate Discord lag and keep everyone perfectly in sync.

## Features

- 🏠 **Room System** — Create a room, get a 6-character code, share with friends
- 🎵 **YouTube Queue** — Submit any YouTube URL to the song queue
- 🔄 **Synchronized Playback** — Everyone sees the same moment via server-side sync
- 🎙️ **In-Game Voice Chat** — Low-latency WebRTC voice via LiveKit (~50–150ms vs Discord's 200–400ms)
- 🏆 **Point System** — Vote 1–5 stars after each performance, earn up to 100 points

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js + TypeScript + Tailwind CSS |
| Backend | Node.js + Express + Socket.io |
| Voice Chat | LiveKit (WebRTC) |
| YouTube | YouTube IFrame API |

## Quick Start

### Prerequisites
- Node.js 18+
- A [LiveKit Cloud](https://livekit.io) account (free tier works)

### 1. Clone & Install
```bash
git clone https://github.com/Qrytics/vcKaraoke.git
cd vcKaraoke
npm run install:all
```

### 2. Configure Environment

**Backend** — copy `backend/.env.example` to `backend/.env` and fill in:
```env
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
LIVEKIT_URL=wss://your-project.livekit.cloud
```

**Frontend** — copy `frontend/.env.example` to `frontend/.env.local` and fill in:
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

### 3. Run Development
```bash
# Terminal 1
npm run dev:backend

# Terminal 2
npm run dev:frontend
```

Open [http://localhost:3000](http://localhost:3000)

## Deployment

- **Frontend**: Deploy `frontend/` to [Vercel](https://vercel.com) — set `NEXT_PUBLIC_BACKEND_URL` to your backend URL
- **Backend**: Deploy `backend/` to [Railway](https://railway.app) or [Fly.io](https://fly.io) — set LiveKit env vars

## How It Works

1. **Create a room** — you get a 6-character code
2. **Share the code** — friends go to the site and join
3. **Add songs** — paste any YouTube URL into the queue
4. **Host starts** — the singer's YouTube player is synced to all viewers via Socket.io events
5. **Vote** — after the performance, everyone rates 1–5 stars
6. **Leaderboard** — points are tallied and the next singer goes up

## License

MIT
