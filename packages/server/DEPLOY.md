# Deploying the Vango server

Two always-on processes share one image: the API and the chain watcher. Both read the
same database. Railway is the click-only path; Fly.io works the same way with `fly.toml`.

## Railway (recommended, no CLI)

1. New project, deploy from the GitHub repo. Root directory: repository root. Builder:
   Dockerfile at `packages/server/Dockerfile` (set "Dockerfile path" to that).
2. Service 1, name `api`. Start command: leave the image default (`npx tsx src/index.ts`).
   Expose port 8787 and generate a public domain. This domain is `API_ORIGIN` for the
   web app on Vercel.
3. Service 2, name `watcher`, same repo and Dockerfile. Start command:
   `npx tsx src/watcher/index.ts`. No public domain.
4. Variables on both services (Railway shared variables make this one list):

| Key | Value |
|---|---|
| NIMIQ_RPC_URL | `https://rpc.nimiqwatch.com` for mainnet, `https://rpc.testnet.nimiqwatch.com` for testnet |
| NIMIQ_NETWORK | `MainAlbatross` or `TestAlbatross`, matching the URL above |
| DATABASE_URL | the Neon pooled connection string |
| PORT | `8787` |
| WATCHER_INTERVAL_MS | `3000` |
| ALLOWED_ORIGINS | `https://<the web app domain>` |
| SPIKE_MERCHANT_PRIVATE_KEY | any fresh 64-hex key; only the spike page and the testnet scripts use it, never the app |

5. Neon: create a project, take the pooled connection string. Migrations run at boot of
   either process, so the first deploy creates the schema.
6. Check: `curl https://<api domain>/api/cards/NOPE` returns `{"error":"unknown card"}`.

## Fly.io

`fly launch` from the repository root with `--dockerfile packages/server/Dockerfile`,
then a second process group in `fly.toml`:

```toml
[processes]
  api = "npx tsx src/index.ts"
  watcher = "npx tsx src/watcher/index.ts"
```

Same variables via `fly secrets set`. Only the `api` process needs a public service on 8787.

## What follows the network

One deployment serves one network. Judges and real users are on mainnet; the prove-it
command and the spike page are testnet tools. Never point a mainnet server at
`SPIKE_MERCHANT_PRIVATE_KEY` money: the sending helper refuses to run outside
TestAlbatross by construction.
