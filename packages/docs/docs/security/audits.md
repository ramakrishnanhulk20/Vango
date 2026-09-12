---
title: Audits
description: Vango is self-audited. Here is exactly how, and what that does not cover.
---

# Audits

**Vango has not been audited by an outside firm.** No third party has reviewed this code. If you
are a judge, a merchant or a developer deciding how much to trust it, that is the first fact you
should have, and it is why this page exists instead of a badge.

What we did instead is written down here so you can check it yourself.

## How it was checked

**1. A threat model written before the tests.** Who attacks, what they want, where they can get
in, and for each attack what stops it and what proves it. It also lists the weaknesses we did not
fix, in plain words. Read it at [threat model](./threat-model.md).

**2. An offline suite where the attacks are the test names.** 87 tests across 18 files, running
against a real Postgres (PGlite) rather than a mock database:

| File | Test names, as they read in the file |
|---|---|
| `test/stamps.test.ts` | "refuses the same transaction hash twice", "refuses a payment from the merchant", "a merchant cannot stamp one of their cards from another of their cards", "refuses a payment below the card minimum", "refuses a memo for an unknown or inactive card", "leaves stamps that belong to someone else alone" |
| `test/stamps.property.test.ts` | "property: stamp count never exceeds confirmed matching payments" |
| `test/auth.test.ts` | "refuses a login signature for a different address", "refuses a reused login nonce", "refuses a remote account that already belongs to another wallet", "refuses a user id used as if it were a token" |
| `test/verify.test.ts` | Ed25519 verification over the Nimiq signed-message format, and address derivation |
| `test/redeem.test.ts` | "refuses to redeem a card that is not full", "refuses a replayed redemption signature", "refuses a merchant confirming another merchant", "a redeem nonce for one card cannot open another card", "cashback settles once and the same hash cannot settle twice", "refuses a cashback payment that did not come from the merchant" |
| `test/redeem.race.test.ts` | "two concurrent signs for one full card open exactly one reward" |
| `test/redeem.property.test.ts` | "property: stamps consumed never exceed stamps earned", "six-digit codes never collide among one merchant" |
| `test/watcher.test.ts` | "keeps the cursor where it was when the node fails, and catches up next pass" |
| `test/watcher.paging.test.ts` | "reads a busy address across more than one page", "drops payments that went somewhere else and never loops forever" |
| `test/ratelimit.test.ts` | "rate limits repeated login attempts", "counts against the caller, not a header the caller chose" |
| `test/cards.test.ts`, `test/cards.api.test.ts` | "a card always receives at the merchant's own wallet", "refuses a body that names its own receiving address", "only the owner can deactivate a card", "refuses a reward rule the stamp engine could not act on" |
| `test/nonces.test.ts`, `test/code.test.ts`, `test/address.test.ts`, `test/rpc.test.ts`, `test/send.test.ts`, `test/stamps.api.test.ts` | The pieces the rules above stand on |

Run it with `npm test` inside `packages/server`.

**3. Six of those attacks repeated against the live chain.** `npm run prove` sends real testnet
payments from a real key and shows the refusal each time. The saved output is in `docs/proofs/`,
and the run of 12 September 2026 passed 10 of 10 checks. It is pasted in full at
[the prove-it command](../developers/the-prove-it-command.md), so you can compare what we claim
against what the chain actually said.

**4. The hard guarantees moved into the database.** One stamp per transaction hash, one pending
reward per card and customer, one settlement per cashback payment, and unique card codes are all
indexes, not code paths. Two processes racing cannot talk their way past an index.

## What this does not cover

- **No external audit and no bug bounty.** Only the people who wrote it have read it.
- **No load or denial-of-service testing.** Rate limits are in place and tested for correctness,
  not under a flood.
- **The public RPC node is trusted.** If it served false transactions, stamps could be wrong.
  Reading from two independent nodes and requiring agreement is the fix, and it is not built yet.
- **One phone, one operating system.** The wallet behaviour was verified on an iPhone inside
  Nimiq Pay. Android was not tested.
- **No formal verification and no fuzzing of the HTTP layer itself.** The property tests generate
  payment and redemption sequences, not arbitrary requests.

## If you find something

Open an issue on the repository. There is no reward programme, and we would rather hear about a
hole than have it stay quiet.
