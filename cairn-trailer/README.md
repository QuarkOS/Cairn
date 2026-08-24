# Cairn Release Trailer

Remotion project for the Cairn v0.4 product release trailer, formatted for posting on X.

## Preview

```bash
cd cairn-trailer
npm run dev
```

Open **CairnTrailer** (16:9) or **CairnTrailerVertical** (9:16) in Remotion Studio.

## Render

Landscape (recommended for X timeline):

```bash
npx remotion render CairnTrailer out/cairn-v0.4-trailer.mp4
```

Portrait (mobile feed):

```bash
npx remotion render CairnTrailerVertical out/cairn-v0.4-trailer-vertical.mp4
```

## Suggested X post

```
Cairn v0.4 — typed facts that outlive the session.

Assert · Recall · Retract
Desk + Agent Canvas
SQLite · JSON API · MCP

npx --yes github:QuarkOS/Cairn init --project
```

Built with [Remotion](https://www.remotion.dev).
