# Scramble for Africa — Browser-Only Publishing Edition

**No installations required on your computer or on student Chromebooks.**

Read **START_HERE_NO_INSTALL.txt** for the exact GitHub -> Cloudflare
web-browser-only publishing process. GitHub hosts the source repository;
Cloudflare builds and hosts the game, including its multiplayer Durable
Object game rooms. Deployment and the first real seven-Chromebook test
must happen in the user's accounts before this is classroom-ready.

## How it plays

Teacher: Host game -> Copy student link -> Approve teams -> Start game.
Students: Open link from Canvas -> Choose country -> Join -> Take turns.
There are seven countries, approximately 72 regions, private diplomacy,
adaptive African resistance, and teacher-visible outcomes.

## Cloudflare Workers Builds settings

- Project/Worker name: `scramble-colonial-race`
- Root: `/`
- Branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

These commands are performed by the remote Cloudflare build system; you
**do not** need Node.js or the command line on your Windows computer.

The repository must contain `wrangler.jsonc`, `package.json`, `worker/`,
`data/`, `scripts/`, and `public/` at the GitHub repo's top level.

## Deployment architecture

- Cloudflare Worker: `worker/index.js`
- SQLite Durable Object: multiplayer game-room state
- Static assets: `public/`
- Game engine: `engine.js` and `multiplayer.js`
- Classroom link: `https://<your-site>.workers.dev/?room=XXXXXX`
- Secure room actions: `/api/rooms/...`

No Cloudflare or GitHub accounts have been connected here; therefore no
actual public link exists yet. The free plan has usage limits. Do a pilot
session on student Chromebooks, and ask school IT to allow your site if
necessary. This is a development build, not certified production software.
