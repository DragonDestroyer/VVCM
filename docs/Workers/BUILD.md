# Worker deploy commands

Each Cloudflare Worker needs its own deploy command. Do not reuse the ledger command on the others. `wrangler.ledger.toml` names the script `vault-ledger` and adds the 00:00 UTC cron, so the other builds fail or deploy the wrong script if they point at it.

Root directory stays the repo root. Build command can stay empty.

| Worker | Deploy command |
|---|---|
| vault-ledger | `npx wrangler deploy --config docs/Workers/wrangler.ledger.toml` |
| vault-admin | `npx wrangler deploy --config docs/Workers/wrangler.admin.toml` |
| verify-bot | `npx wrangler deploy --config docs/Workers/wrangler.verify.toml` |

Watch paths, if you set them:

- vault-ledger: `docs/Workers/vault-ledger.js`, `docs/Workers/wrangler.ledger.toml`
- vault-admin: `docs/Workers/vault-admin.js`, `docs/Workers/wrangler.admin.toml`
- verify-bot: `docs/Workers/verify-bot.js`, `docs/Workers/wrangler.verify.toml`
