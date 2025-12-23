# Graba

A web-based audio recorder that captures high-quality audio from your screen or browser tab, with optional microphone mixing.

## Features

- **System Audio Recording** - Capture audio from any browser tab or screen share
- **Microphone Integration** - Optionally record your voice alongside system audio
- **Audio Ducking** - Automatically lower system audio volume when speaking
- **Multiple Output Formats** - Export as MP3, AAC, or Opus/WebM
- **Recording History** - Access and manage your recent recordings
- **Multilingual** - Available in English and Spanish

## Requirements

- Node.js 18+
- FFmpeg (for audio processing)

## Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/ogomez92/graba.git
cd graba

# Install dependencies
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build

```bash
npm run build
npm run start
```

The production server runs on port 3494 by default.

## Usage

1. Click **Start Recording** to begin capturing audio
2. Select a browser tab or screen to share (with audio enabled)
3. Optionally enable microphone to record your voice
4. Click **Stop Recording** when finished
5. Choose your output format and processing options
6. Download your processed audio files

## Project Structure

```
src/
├── lib/
│   ├── components/     # Svelte components
│   ├── i18n/           # Internationalization
│   ├── server/         # Server-side utilities
│   ├── stores/         # Svelte stores
│   └── utils/          # Client utilities
├── routes/             # SvelteKit routes and API endpoints
data/                   # Temporary recording storage
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Run production server |
| `npm run check` | Run type checking |
| `npm run lint` | Run linter |
| `npm run format` | Format code with Prettier |

## Tech Stack

- [SvelteKit](https://kit.svelte.dev/) - Full-stack framework
- [Svelte 5](https://svelte.dev/) - UI framework with runes
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Vite](https://vitejs.dev/) - Build tool
- [FFmpeg](https://ffmpeg.org/) - Audio processing
