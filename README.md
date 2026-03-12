# DinkPad - Pickleball Session Manager 🎾

A modern, mobile-first web application for managing pickleball open play sessions with intelligent matchmaking.

## Features

### 🎯 Smart Matchmaking (3 Strategies)

1. **Balanced Skill Gap** ⚖️
   - Creates fair teams by balancing skill levels
   - Pairs high + low skill vs high + low skill
   - Best for competitive, evenly-matched games

2. **Minimize Wait Time** ⏱️
   - Prioritizes players who have waited longest
   - Gets everyone back on court ASAP
   - Best for busy sessions with many players

3. **Maximize Variety** 🔄
   - Tracks player interaction history
   - Avoids repeat partner/opponent pairings
   - Best for social mixing and meeting new players

### 📱 Mobile-First Design

- Optimized for smartphones (320px+) and tablets (768px+)
- Touch-optimized controls with large tap targets
- Bottom sheet modals for mobile UX
- Responsive layout adapts to all screen sizes
- Fixed header and bottom bar for easy access

### 🎮 Session Management

- **Player Pool**: Add/remove/pause players during session
- **Court Visualization**: Clear display of partner pairings for each match
- **Live Timers**: Track game duration and player wait times
- **Quick Actions**: Start all matches with one tap
- **Session Persistence**: Auto-saves to localStorage (survives refresh/close)

### 💾 Data Persistence

- **Client-Side Storage**: All data stored in localStorage
- **Auto-Save**: Session automatically saved on every change
- **Resume Sessions**: Return to active sessions after browser close
- **No Server Required**: Fully client-side application

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or pnpm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
npm run build
npm start
```

## Usage

1. **Setup Session**
   - Enter number of courts
   - Paste player list (format: `Name SkillRating`)
   - Example: `John Doe 4.5`

2. **Manage Session**
   - Select matchmaking strategy
   - Start matches (individual or all at once)
   - End games when complete
   - Add new players mid-session
   - Pause players temporarily
   - View wait times and game counts

3. **End Session**
   - Click "End Session" in header
   - Confirm to clear all data

## Future Enhancements (Database Integration)

While the current version is fully client-side, here's the planned database integration:

### Potential Architecture

**Option 1: Supabase** (Recommended)

- Real-time sync between devices
- PostgreSQL backend with row-level security
- Built-in authentication
- Free tier for most use cases

**Option 2: Firebase Firestore**

- Real-time database
- Offline persistence
- Strong mobile SDK support

**Option 3: Vercel Postgres + KV**

- Native Next.js integration
- SQL for complex queries
- Redis for session state

### Database Schema (Future)

```sql
-- Sessions
sessions: id, host_id, court_count, created_at, ended_at, status

-- Players
players: id, session_id, name, skill_rating, status, total_wait_time

-- Matches
matches: id, session_id, court_number, team_a_players, team_b_players,
         start_time, end_time, strategy_used

-- Match History
match_history: player1_id, player2_id, match_id, relationship (partner/opponent)
```

### Benefits of Future DB

- Multi-device access (host phone + tablet scoreboard)
- Historical analytics across sessions
- Player profiles with aggregated stats
- Tournament/league management
- Cloud backup

### Migration Path

The current localStorage data structure is designed to easily serialize to a database format, making future migration straightforward.

## Tech Stack

- **Framework**: Next.js 16 (React 19)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Storage**: localStorage API
- **Build**: Vercel

## Project Structure

```
app/
├── page.tsx              # Landing page
├── layout.tsx            # Root layout
├── globals.css           # Global styles
├── types.ts              # TypeScript interfaces
├── setup/
│   └── page.tsx         # Session setup page
├── session/
│   └── page.tsx         # Main session management page
└── utils/
    ├── sessionStorage.ts  # localStorage utilities
    └── matchmaking.ts     # Matchmaking algorithms
```

## License

MIT

## Contributing

Contributions welcome! This is a hobby project designed to help pickleball hosts manage their open play sessions more efficiently.
