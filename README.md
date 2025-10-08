SuzzyTech Project Cloner - Render & Vercel Ready

This package is prepared to deploy:

- Render: Upload the ZIP and use `node server.js` as start command. The server exposes `/clone` for POST uploads and serves the UI from `/public/index.html`.

- Vercel: Deploy the root to Vercel. The static site is in `/public` and the serverless endpoint is `/api/clone` (uses busboy).

Usage (client):
- Use the UI at `/` to upload a ZIP and mappings.
- Mappings must be JSON array: [{"old":"BossLady","_new":"SuzzyCore"}]

Notes:
- The replacer supports many Unicode/"fancy" alphabets (Mathematical Alphanumeric, Fullwidth, Circled, diacritics).
- For large projects deploy on Render (serverful) for best performance. Vercel function has execution time limits.
