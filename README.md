# Blog Writer

A minimal markdown blog writer with live preview.

## Usage

```bash
bun install     # Install dependencies
bun run write   # Start local writer at localhost:3000
bun run deploy  # Build & deploy to Cloudflare Pages
```

## How Deployment Works

1. `bun run write` → Local writer saves markdown files to `markdown/`
2. `bun run deploy` → Converts markdown to static HTML in `dist/`, then uploads to Cloudflare's edge network
3. Cloudflare serves your blog as static files — no server needed, instant loads worldwide
