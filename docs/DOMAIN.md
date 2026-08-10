# Custom domain

## Cloudflare Pages (recommended for this project)

1. Pages project → **Custom domains** → Add `currency.vidiaville.com` (or your host)
2. DNS CNAME: `currency` → `your-project.pages.dev`
3. SSL is automatic on Cloudflare

## GitHub Pages (optional alternative)

If you use GitHub Pages instead of Cloudflare, keep the `CNAME` file in this folder:

```
currency.vidiaville.com
```

Then set the same domain under GitHub → Settings → Pages.
