# VidiaVille Currency Manager (static UI)

This folder is a **static** front-end suitable for **GitHub Pages**.

## Enable GitHub Pages

1. Push this repo to GitHub
2. Repo → **Settings** → **Pages**
3. Source: **Deploy from a branch**
4. Branch: `main` (or `master`), folder: **`/docs`**
5. Save — site will be at `https://<you>.github.io/<repo>/`

## Pages

| File | What it is |
|------|------------|
| `index.html` | Homepage |
| `dashboard.html` | Citizen dashboard (Account / Companies / Pay + Create Company form) |

**Sign in with Discord** currently goes straight to the dashboard as **Dragon** (temporary testing).

## Note

This is UI-only. Login, balances, company applications, and admin approval still need a backend later (Flask, Cloudflare Workers, etc.). The Create Company form saves drafts to `localStorage` and logs Apply to the browser console for now.
