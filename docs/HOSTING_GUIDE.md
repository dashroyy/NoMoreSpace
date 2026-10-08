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

1. Install **Node.js** (the LTS version) from <https://nodejs.org>.
2. Install **Git** from <https://git-scm.com>, or use **GitHub Desktop** if you prefer buttons over typing.
3. Download your repo and start the game:
   ```bash
   git clone https://github.com/dashroyy/nomorespace.git
   cd nomorespace
   npm install      # downloads socket.io into node_modules/
   npm run dev      # starts the game and restarts it when you save a file
   ```
4. Open <http://localhost:3000>. To test as several players, open a few **private/incognito windows**. Each one counts as a different player. You need 5 players to launch.
5. `npm test` runs the automated rule checks.

**The everyday Git loop** (save → describe → upload):
```bash
git add .
git commit -m "Add a new role: the Engineer"
git push
```

## Step 2: Buy a domain on Namecheap

1. Search on <https://www.namecheap.com> for something like `nomorespace.xyz`, `.gg`, `.fun`, `.space` (fitting!) or `.club`.
2. ⚠️ Look at the **renewal** price, not only the first-year price. Some cheap domains cost a lot more in year two.
3. Skip the extras (hosting, email, "PremiumDNS"). Cloudflare covers what you need for free.

## Step 3: Get a server

You have two options. **Option A is what your friend's "1 GB droplet" means, and it's what this repo is set up for.**

### Option A: DigitalOcean droplet (recommended, ~$6/month)
1. Sign up at <https://www.digitalocean.com>. Look for new-account credit offers.
2. Create → Droplet → **Ubuntu 24.04**, **Basic, Regular, 1 GB / 1 CPU**, a region near your players.
3. Authentication: choose **SSH key** and follow their instructions (safer than a password).
4. Copy the droplet's **IP address** (e.g. `203.0.113.10`).
5. Log in from your terminal and run the setup script:
   ```bash
   ssh root@YOUR_IP
   curl -O https://raw.githubusercontent.com/dashroyy/nomorespace/main/deploy/setup-server.sh
   bash setup-server.sh yourdomain.xyz
   ```
   > Because the repo is private, that `curl` link won't work. Instead, open `deploy/setup-server.sh` on GitHub, copy its contents, and on the server run `nano setup-server.sh`, paste, save (Ctrl+O, Enter, Ctrl+X), then run `bash setup-server.sh yourdomain.xyz`.

   The script installs Node.js and Caddy, creates the service that keeps the game running, and sets up the firewall. At the end it prints the last steps for GitHub.

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
4. **Start with the cloud icon grey ("DNS only")**. Visit `https://yourdomain.xyz` and check it loads with a padlock. That means Caddy got its HTTPS certificate.
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

> **Secrets are secret.** Never paste private keys, passwords or vouchers into code files or chats. They only go in GitHub Secrets.

## When something breaks

| Symptom | Where to look |
|---|---|
| Red ❌ on a commit on GitHub | Actions tab → click the run → read the failing step |
| Site doesn't load | On the server: `systemctl status nomorespace` and `journalctl -u nomorespace -n 50` |
| HTTPS error | `journalctl -u caddy -n 50`; check Cloudflare SSL mode is **Full (strict)** |
| Is the game alive? | Visit `https://yourdomain.xyz/health` |
| Server feels slow | `htop` (install with `apt install htop`), and look at memory |
