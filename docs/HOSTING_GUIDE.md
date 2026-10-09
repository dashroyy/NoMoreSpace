# Hosting guide: from code to `nomorespace.<something>` on the internet

This guide assumes you're brand new to this. Work through it top to bottom.

## The big picture

```
 You edit code ──push──▶ GitHub (private repo)
                            │  GitHub Actions: run tests, then copy code to server
                            ▼
 Player's browser ──▶ Cloudflare ──▶ Your server (1 GB droplet / Cloudways)
   types your             DNS, HTTPS,       Caddy (front door, HTTPS)
   domain                 DDoS shield         └─▶ Node.js game (port 3000)
                              ▲
                     Namecheap: you rent the domain name here
```

| Thing | What it is | What it does for you | Rough cost |
|---|---|---|---|
| **GitHub** | Where your code lives, with full history | Backup, undo, teamwork, triggers auto-deploys | Free (private repos included) |
| **GitHub Actions** | Robots that run on GitHub | Tests every change; publishes to your server when `main` changes | Free tier is plenty |
| **Namecheap** | Domain registrar | You rent `nomorespace.xyz` (or similar) | ~$1–15/year (cheap first year, check the renewal price!) |
| **Server** (droplet) | A small computer in a data centre that's always on | Runs the game 24/7 | ~$6/month for 1 GB RAM |
| **Cloudways** | A company that manages a server for you | Same as above, with a friendlier dashboard | From ~$11–14/month (voucher may help) |
| **Cloudflare** | Sits between players and your server | Free HTTPS, DDoS protection, hides your server's IP, DNS | Free plan is enough |

## Your friend's checklist, explained

1. **Resource optimisation** and 2. **Lightweight implementation**: keep the game small so it runs on a cheap server. Already done:
   - One dependency (`socket.io`) and no frameworks or build step. The browser gets plain HTML/CSS/JS.
   - All game state is held in memory (no database yet). One room uses a few KB.
   - Capped at 200 rooms × 15 players, and Node is limited to 256 MB of memory (`deploy/nomorespace.service`).
   - The setup script adds 1 GB of *swap* (disk used as emergency memory) so the server won't crash if memory gets tight.
3. **1 GB RAM server droplet**: a "droplet" is DigitalOcean's word for a virtual server. 1 GB is plenty for this game with dozens of simultaneous games.
4. **Pawtle.com**: I don't know this site and can't tell you what your friend meant. It might be an example of a game they like, or a hosting service. Ask them.
5. **Add the GitHub connector in Claude**: ✅ done. That's how I can read and push to your repo.
6. **Create a GitHub account**: ✅ done.
7. **Create a repo for the multiplayer game**: ✅ `dashroyy/nomorespace`. **Check it's private:** GitHub → your repo → Settings → scroll to "Danger Zone" → "Change visibility".
8. **Do all the fun stuff in there**: that's the game code (`server/`, `public/`).
9. **Publish via GitHub Actions**: ✅ `.github/workflows/deploy.yml`. It switches on once you add the server secrets (step 5 below).

---

## Step 1: Run the game on your own computer

1. Install **Node.js** (the LTS version) from <https://nodejs.org>, and **Git** from <https://git-scm.com> (on Windows, keep all the default options).
2. **Close and reopen** your terminal after installing, so it can find the new programs.
3. Open a **terminal**. It's *not* the "Node.js" app in your Start menu: that opens a `>` prompt that only understands JavaScript.
   - **Windows:** Start menu → type **PowerShell** → open "Windows PowerShell".
   - **Mac:** Spotlight (⌘ Space) → **Terminal**.
4. Check both are installed. Each should print a version number:
   ```
   node -v
   npm -v
   git --version
   ```
5. Download your repo and start the game:
   ```bash
   cd ~/Documents
   git clone https://github.com/dashroyy/nomorespace.git
   cd nomorespace
   npm install      # downloads socket.io into node_modules/
   npm run dev      # starts the game and restarts it when you save a file
   ```
   The first `git clone` of a private repo opens a GitHub sign-in window. Log in there.
6. Open <http://localhost:3000>. To test as several players, open a few **private/incognito windows**. Each one counts as a different player. You need 5 players to launch.
7. Stop the game with **Ctrl+C** in the terminal. `npm test` runs the automated rule checks.

### If a command won't run

| What you see | Fix |
|---|---|
| A `>` prompt, and `npm` gives `ReferenceError` or `SyntaxError` | You're in the Node.js app, not a terminal. Type `.exit`, close it, and open PowerShell (step 3). |
| `'node'` / `'npm'` / `'git'` **is not recognized** | Close **all** terminal windows and open a new one. Still broken? Restart your computer, or reinstall and keep "Add to PATH" ticked. |
| `npm.ps1 cannot be loaded because running scripts is disabled on this system` | Windows blocks scripts by default. Run this once in PowerShell, answer **Y**, then retry: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `npm ERR! enoent ... package.json` or `Missing script: "dev"` | You're in the wrong folder, or you downloaded `main` before the game code was merged into it. Run `cd nomorespace`, then `git pull`. |
| `EADDRINUSE: address already in use :::3000` | The game is already running in another terminal window. Close that one. |

**The everyday Git loop** (save → describe → upload):
```bash
git add .
git commit -m "Add a new role: the Engineer"
git push
```

## Step 2: Buy a domain on Namecheap

✅ Done: **nomorespace.online**.

1. Search on <https://www.namecheap.com> for something like `nomorespace.xyz`, `.gg`, `.fun`, `.space` (fitting!) or `.club`.
2. ⚠️ Look at the **renewal** price, not only the first-year price. Some cheap domains cost a lot more in year two.
3. Skip the extras (hosting, email, "PremiumDNS"). Cloudflare covers what you need for free.

## Step 3: Get a server

You have two options. **Option A is what your friend's "1 GB droplet" means, and it's what this repo is set up for.**

### Option A: DigitalOcean droplet (recommended, ~$6/month)
1. Sign up at <https://www.digitalocean.com>. Look for new-account credit offers.
2. **Create → Droplets**, then choose:
   - **Region:** closest to most of your players (e.g. London or Amsterdam for the UK/Europe).
   - **Image:** Ubuntu **24.04 (LTS)**.
   - **Size:** Basic → Regular → **$6/mo (1 GB / 1 CPU)**.
   - **Authentication:** **Password** is simplest to start. Use a long, unique one and save it in a password manager.
   - **Hostname:** `nomorespace`.
3. Click **Create Droplet**. When it's ready, copy its **IPv4 address** (e.g. `203.0.113.10`).
4. Copy the setup script from your computer to the droplet. In your terminal, inside the `nomorespace` folder:
   ```bash
   scp deploy/setup-server.sh root@YOUR_IP:
   ```
   Type `yes` if it asks whether you trust the server, then enter the droplet password.
5. Log in to the droplet and run the script:
   ```bash
   ssh root@YOUR_IP
   bash setup-server.sh nomorespace.online
   ```
   It takes about 3–5 minutes. It installs Node.js and Caddy, creates the service that keeps the game running, and turns on the firewall. At the end it prints the last steps for GitHub (step 5 below). Type `exit` to leave the server.

### Option B: Cloudways (if your voucher makes it worthwhile)
Cloudways runs a DigitalOcean (or other) server for you and gives you a dashboard. It was built mainly for PHP sites like WordPress, but it now has [Node.js support](https://support.cloudways.com/en/collections/19668298-getting-started-with-node-js-on-cloudways).
- In their docs, Node apps sit behind Apache, and you route traffic to your Node port with an `.htaccess` proxy rule.
- It's unclear whether that proxy passes **WebSockets** (the live connection) through. That's fine: Socket.IO automatically falls back to regular HTTP requests, so the game still works, just slightly less snappily. Test it once deployed.
- You can't use `setup-server.sh` there. Follow Cloudways' Node.js guide instead. In GitHub, set `DEPLOY_RESTART_CMD` to whatever restart command Cloudways tells you to use (often a `pm2 restart` command).
- **My take:** if the voucher covers several months, try it. Otherwise a plain droplet is cheaper and simpler for a Node game.

## Step 4: Put Cloudflare in front

1. Sign up at <https://dash.cloudflare.com> → **Add a site** → enter your domain → **Free plan**.
2. Cloudflare gives you two **nameservers** (e.g. `ada.ns.cloudflare.com`). In Namecheap go to Domain List → Manage → Nameservers → **Custom DNS**, paste both, and save. This can take a few minutes to a few hours.
3. In Cloudflare → **DNS**, add:
   - `A` record, name `@`, value = your server IP
   - `A` record, name `www`, value = your server IP
4. **Start with the cloud icon grey ("DNS only")**. Visit `https://nomorespace.online` and check it loads with a padlock. That means Caddy got its HTTPS certificate.
5. Then switch both records to **orange ("Proxied")**. Now Cloudflare hides your IP and absorbs attacks.
6. Cloudflare → **SSL/TLS** → set mode to **Full (strict)**.
7. WebSockets are on by default in Cloudflare (Network → WebSockets). Leave them on.

## Step 5: Turn on automatic deploys

The setup script ends by printing these steps. In short:

1. Make a key pair just for GitHub, on your own computer:
   `ssh-keygen -t ed25519 -f nomorespace_deploy -N ""`
2. Put the **.pub** (public) key in `/home/nomorespace/.ssh/authorized_keys` on the server.
3. GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**:

   | Secret | Value |
   |---|---|
   | `DEPLOY_HOST` | your server IP |
   | `DEPLOY_USER` | `nomorespace` |
   | `DEPLOY_PATH` | `/home/nomorespace/app` |
   | `DEPLOY_SSH_KEY` | the full contents of `nomorespace_deploy` (the **private** key, no `.pub`) |

4. GitHub → **Actions** tab → **Deploy** → **Run workflow**.

From then on, every push or merge to `main` runs the tests, and if they pass, the game goes live within about a minute. 🚀

**Deploys don't end games.** Before restarting, the deploy tells everyone "Ship systems rebooting in 20s", then waits 20 seconds. When the server stops it saves every running game to `data/rooms.json` (it also saves once a minute, in case of a crash), and when it starts again it loads them back. Players' pages reconnect by themselves and take their seats back, so a game carries on where it left off. Saves older than 30 minutes are ignored.

> **Secrets are secret.** Never paste private keys, passwords or vouchers into code files or chats. They only go in GitHub Secrets.

## When something breaks

| Symptom | Where to look |
|---|---|
| Red ❌ on a commit on GitHub | Actions tab → click the run → read the failing step |
| Site doesn't load | On the server: `systemctl status nomorespace` and `journalctl -u nomorespace -n 50` |
| HTTPS error | `journalctl -u caddy -n 50`; check Cloudflare SSL mode is **Full (strict)** |
| Is the game alive? | Visit `https://nomorespace.online/health` |
| Server feels slow | `htop` (install with `apt install htop`), and look at memory |

## Replays

Every finished game is saved to `data/replays/` (the newest 500 are kept), and the end screen has a **🔗 Copy replay link** button: `https://nomorespace.online/?replay=<id>` replays the end-game reveal for anyone.

## Play stats and bug reports
The game keeps two small files in `data/` next to the app on your server. Deploys never touch this folder.

- **Dashboard:** open `https://nomorespace.online/dashboard` for a readable page: how many ships and people are online right now, crew win rate by player count (amber bars point at balance problems), games per day, a sortable table of every role (how often it's dealt, how often its team wins, how often it survives), the last 10 games, and the bug reports (paste your admin token, see below). It refreshes every 30 seconds.
- **Stats:** the same numbers as raw JSON are at `https://nomorespace.online/stats`.
- **Bug reports:** players can press 🐞 Report a bug. To read the reports, log in to your droplet and run:
  ```
  tail -n 20 /home/nomorespace/app/data/reports.jsonl
  ```
  Or, to read them in a browser, add a secret password to the service: `sudo systemctl edit nomorespace`, add
  ```
  [Service]
  Environment=NMS_ADMIN_TOKEN=pick-a-long-secret
  ```
  then `sudo systemctl restart nomorespace` and paste the secret into the 🐞 box on `/dashboard` (or open `https://nomorespace.online/reports?token=pick-a-long-secret`).
