# VidiaVille Currency Manager

Static front-end for VidiaVille’s civic ledger (Launch v0.1).  
Hosted via **Cloudflare Pages**, source managed in **GitHub**.

> Trust us with your life’s earnings.

## Live site files (`docs/`)

| File | Page |
|------|------|
| `index.html` | Homepage |
| `dashboard.html` | Citizen dashboard (Account / Companies / Pay + Create Company) |
| `owner-overview.html` | Company owner view (Riverfront Café template) |
| `worker-overview.html` | Company worker view (Vidia Motors template) |

### Navigation map

```
index.html
  └─ Sign in → dashboard.html
       ├─ Riverfront Café (Owner) → owner-overview.html
       ├─ Vidia Motors (Sales Associate) → worker-overview.html
       └─ Harbor Logistics → (not linked yet)
```

## Deploy: GitHub → Cloudflare Pages

### 1. Push this folder to GitHub

```bash
cd vidiaville-payroll
git init
git add .
git commit -m "VidiaVille Currency Manager — Launch v0.1 static UI"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

### 2. Connect Cloudflare Pages

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select this repository
3. Build settings:

| Setting | Value |
|---------|--------|
| Production branch | `main` |
| Framework preset | **None** |
| Build command | *(leave empty)* |
| **Build output directory** | **`docs`** |

4. **Save and Deploy**

Pushes to `main` redeploy automatically.

### 3. Custom domain (optional)

Pages project → **Custom domains** → add e.g. `currency.vidiaville.com`.

DNS (Cloudflare DNS recommended):

| Type | Name | Target |
|------|------|--------|
| CNAME | `currency` | `YOUR_PROJECT.pages.dev` |

HTTPS is handled by Cloudflare.

> `docs/CNAME` is only for GitHub Pages. Cloudflare uses the dashboard + DNS.

## Local preview

```bash
cd docs
python3 -m http.server 8080
# → http://127.0.0.1:8080
```

## Placeholders

- Discord login → dashboard as **Dragon** (testing only)
- Money / applications → `localStorage` + console until a database API exists
- Flask sketch in `backend/` is **not** deployed to Cloudflare

## Design

- Address users as **citizens**
- Currency: **Vidiadollars**
- Colors: blue + green, white accents
