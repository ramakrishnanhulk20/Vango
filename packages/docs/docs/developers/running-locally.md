---
title: Running locally
description: Clone, set five environment keys, run the server, the watcher and the web app, then open it on a phone.
---

# Running locally

Vango is one repository with npm workspaces: `packages/server` (the API, the stamp engine and
the chain watcher), `packages/web` (the mini app and the landing page), and `packages/docs`
(this site). Node 20 or newer.

```bash
git clone <the repo>
cd vango
npm install
```

One install at the root covers all three packages.

## The database

There is nothing to install. With `DATABASE_URL` left empty, the server runs
[PGlite](https://pglite.dev), a real Postgres compiled to WebAssembly, storing its files under
`packages/server/.data`. Tests use it too, each with its own throwaway copy.

Point `DATABASE_URL` at a hosted Postgres (we use Neon) and the same code runs against that
instead. Nothing above the database client knows which one it is talking to.

## The environment keys

Copy `.env.example` to `.env` at the repo root and fill it in.

| Key | What it is |
|---|---|
| `NIMIQ_RPC_URL` | The public Nimiq JSON-RPC node the server reads the chain through, for example `https://rpc.testnet.nimiqwatch.com` |
| `NIMIQ_NETWORK` | `TestAlbatross` or `MainAlbatross`, and it has to match the node above |
| `SPIKE_MERCHANT_PRIVATE_KEY` | A 64 character hex key for the throwaway merchant wallet the proof run pays from. Generate one with `npm run spike:genkey` inside `packages/server`. Never a wallet with real money in it |
| `PORT` | The port the API listens on, 8787 by default |
| `DATABASE_URL` | Hosted Postgres connection string. Leave blank for local PGlite |
| `WATCHER_INTERVAL_MS` | How often the watcher checks each merchant address, 3000 by default |
| `ALLOWED_ORIGINS` | Browser origins allowed to call the API, comma separated, for example `https://vango.app,http://localhost:3000`. Blank means same origin only |

Nothing secret belongs anywhere except `.env`, which is ignored by git.

## The server

```bash
cd packages/server
npm run db:migrate
npm run seed
npm run dev
```

- `db:migrate` applies the Drizzle migrations. It is safe to run again, and it says how many it
  already had.
- `seed` creates the demo merchant and one card, then prints the card code, the address to pay
  and the memo. Run it twice and it says the card was already there.
- `dev` starts the API on `PORT` with a file watcher, and prints an address you can open on a
  phone on the same network.

## The chain watcher

```bash
cd packages/server
npm run watcher
```

A separate always-on process. Every `WATCHER_INTERVAL_MS` it reads each active card's receiving
address from the node, in pages of 500, and hands anything new to the stamp engine. It exists so
a customer who closes the app mid-payment still gets their stamp. Running it alongside the API is
not a race: the unique index on the transaction hash means whichever one sees a payment first
writes the only stamp.

## The tests and the proof

```bash
cd packages/server
npm test
npm run prove
```

`npm test` is the offline suite against PGlite. `npm run prove` is the live one: it spends real
testnet NIM against a real node and tries ten attacks. See
[the prove-it command](./the-prove-it-command.md).

## The web app

```bash
cd packages/web
npm run dev
```

Next.js on port 3000. It expects the API at the origin you set in `ALLOWED_ORIGINS`.

## Opening it on a phone

The wallet and the camera both need a secure context, so a phone cannot use
`http://192.168.x.x`. Run a tunnel and give Nimiq Pay the HTTPS address it prints:

```bash
cloudflared tunnel --url http://localhost:3000
```

Then in Nimiq Pay: mini apps, Custom URL, paste the address. Pay keeps the domain and drops the
path, so the app has to be served at `/`. A phone on mobile data works exactly like a phone on
your Wi-Fi, which is the loop Vango was developed on.

## This docs site

```bash
cd packages/docs
npm start
```

## One Windows note

The Next.js dev server and a verification `next build` must not share the same `.next`
directory. Set `NEXT_DIST_DIR` to a second directory for the build, or stop the dev server
first.
