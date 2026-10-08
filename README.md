# No More Space

A space-themed social deduction party game inspired by **Blood on the Clocktower**, **Among Us** and **The Traitors**. A Parasite hides among the crew. Find it and airlock it before it takes the ship.

## Quick start

```bash
npm install
npm run dev     # http://localhost:3000 (open 5 incognito windows to test)
npm test
```

## What's where

```
server/game.js      the rules: roles, night, day, voting, who wins
server/index.js     the web server + live connections (Socket.IO)
public/             what the player sees: index.html, style.css, client.js
test/               automated rule checks (npm test)
deploy/             one-time server setup script + config
.github/workflows/  ci.yml runs tests, deploy.yml publishes to your server
docs/               HOSTING_GUIDE.md (start here!) and GAME_DESIGN.md
```

## Guides

- 📖 **[Hosting guide](docs/HOSTING_GUIDE.md)**: GitHub → Namecheap → server → Cloudflare, step by step for beginners
- 🎲 **[Game design](docs/GAME_DESIGN.md)**: rules, roles and ideas for what to build next
