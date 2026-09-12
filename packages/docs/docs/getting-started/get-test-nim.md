---
title: Get test NIM
description: Switch Nimiq Pay to testnet, tap the faucet, and open a development build through Custom URL.
---

# Get test NIM

Everything in Vango can be tried with play money. Nimiq Pay has a hidden testnet mode, and
in testnet mode it hands out free NIM.

## Switch Pay to testnet

1. Open Nimiq Pay and open its menu.
2. **Long-press the settings button for ten seconds.** Keep holding: there is no progress
   bar, the dev menu simply appears.
3. Turn on testnet mode. Pay now shows testnet balances and sends testnet transactions.

## Tap the faucet

In testnet mode there is a **Get free NIM** button. Each tap gives you **110,000 test NIM**,
which is more than enough: a Vango stamp costs 1 NIM by default and Nimiq charges no fee.

Two things to know before you rely on it:

- Testnet mode covers **NIM only**. If a mini app touches an EVM chain, that side stays on
  the real, live network even while Nimiq is on testnet.
- Testnet NIM and real NIM are different worlds. A card created on testnet does not exist
  on mainnet, and the Vango server runs one deployment per network.

## Open a local or tunnelled build

Nimiq Pay will open any HTTPS address you give it, which is how you test your own build on
a real phone.

1. In Pay, open the mini app browser and choose **Custom URL**.
2. Paste your address and open it.

Two rules that cost real time if you miss them:

- **Pay keeps the domain and drops the path.** Whatever you paste, the root path is what
  gets served, so your app must live at `/`.
- **It has to be HTTPS.** The camera and the injected wallet both need a secure context, so
  plain `http://192.168...` will not do. Run a tunnel and paste the tunnel address:

```bash
cloudflared tunnel --url http://localhost:3000
```

Cloudflare prints an HTTPS address that points at your dev server. Paste that into Custom
URL.

That also means a phone on mobile data works exactly like a phone on your Wi-Fi, which is
the loop we developed Vango on. See [Running locally](../developers/running-locally.md) for
the rest of the setup.
