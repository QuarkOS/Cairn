# Cairn

Cairn is a personal knowledge base and note-taking app built with Next.js, React, and Supabase.

## Features

- **Notes & Pages** — Create rich text notes with a block-based editor
- **Knowledge Graph** — Visualize connections between your ideas
- **Search** — Full-text search across all your content
- **Tags & Collections** — Organize notes with flexible tagging
- **Real-time Sync** — Changes sync instantly across devices

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Realtime)
- **Editor**: TipTap (ProseMirror-based)
- **Graph**: React Flow

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in your Supabase credentials

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
src/
├── app/           # Next.js App Router pages
├── components/    # React components
├── lib/           # Utilities and Supabase client
├── hooks/         # Custom React hooks
└── types/         # TypeScript type definitions
```

## License

MIT
