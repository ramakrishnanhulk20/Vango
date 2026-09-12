# Deploying the Vango server

Two always-on processes share one image: the API and the chain watcher. Both read the
same database. Railway is the click-only path; Fly.io works the same way with `fly.toml`.

## Railway (recommended, no CLI)

1. New project with a Postgres database, then two services from the GitHub repo,
   both with the variable `RAILWAY_DOCKERFILE_PATH=packages/server/Dockerfile` so the
   build uses that file with the repository root as context.
2. Service `api`: no `VANGO_PROCESS` variable, so the image runs the API. Expose port
   8787 and generate a public domain. That domain is `API_ORIGIN` for the web app.
3. Service `watcher`: variable `VANGO_PROCESS=src/watcher/index.ts`. No public domain.
   Deploy it after the API is healthy, so the two do not race the first migration.
4. Variables on both services:

| Key | Value |
|---|---|
| NIMIQ_RPC_URL | `https://rpc.nimiqwatch.com` for mainnet, `https://rpc.testnet.nimiqwatch.com` for testnet |
| NIMIQ_NETWORK | `MainAlbatross` or `TestAlbatross`, matching the URL above |
| DATABASE_URL | `${{Postgres.DATABASE_URL}}`, the reference to the Railway Postgres service |
| PORT | `8787` |
| WATCHER_INTERVAL_MS | `3000` |
| ALLOWED_ORIGINS | leave blank: the web app reaches the API through its own server-side rewrite, so no browser origin calls it directly |
| SPIKE_MERCHANT_PRIVATE_KEY | any fresh 64-hex key; only the spike page and the testnet scripts use it, never the app |

5. Migrations run at boot of either process, so the first API deploy creates the schema.
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
