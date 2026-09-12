---
title: Security overview
description: What holds money in Vango, and the four ways in.
---

# Security overview

## What holds money

Nothing.

That is the whole design, and it is worth saying plainly before anything else. A customer's
payment goes from their Nimiq Pay wallet straight to the merchant's wallet. Cashback goes from
the merchant's wallet straight to the customer's. Vango has no wallet, no key, no balance and no
escrow, so the biggest class of attack on any payments product, draining the pot, has nothing to
aim at.

What Vango does hold is a score: which payments counted as stamps, and which rewards were taken.
The worst a successful attack can do is give somebody a free coffee they did not earn, or deny
one they did. That is the ceiling, and everything below is about holding that line.

## The four entry points

1. **The mini app's JSON API.** Login, cards, stamp claims, the wallet read, and the five
   redemption routes. Every body is parsed with a strict schema, every failure returns the same
   `error` shape, and rate limits are counted by IP: 60 a minute globally, 10 on auth, 20 on
   redeem.
2. **The chain watcher reading public RPC.** It only reads. It writes stamps through the same
   engine the API uses, with the same rules and the same unique index on the transaction hash.
3. **The public RPC node.** Shared, rate limited, and trusted to tell the truth about
   transactions. This is the one real trust assumption in Vango and it is stated as such in the
   [threat model](./threat-model.md).
4. **The Nimiq Pay web view.** Vango's own code runs there, so treat it as the attacker's
   computer: it can send anything to the API. The wallet lives outside the web view, which is why
   no key, seed phrase or password ever reaches Vango.

## What the rules rest on

- A stamp exists only if the server fetched the transaction itself and it satisfies all six
  conditions in the [trust model](../concepts/trust-model.md).
- Identity is an Ed25519 signature over a single-use, ten-minute challenge, checked against the
  address the public key derives to.
- Session tokens are 32 random bytes with a `vs1.` prefix, stored only as a hash, never used as a
  record id, never logged, expiring in 30 days.
- The hard guarantees are database indexes, not careful code: one stamp per transaction hash, one
  pending reward per card and customer, one settlement per cashback payment.

## Where to look next

- [Threat model](./threat-model.md): every attack, what stops it, and the proof, including the
  weaknesses we chose not to fix.
- [Audits](./audits.md): who checked this and how, stated without dressing it up.
- [The prove-it command](../developers/the-prove-it-command.md): six of these attacks run against
  the live testnet, with the output saved.
