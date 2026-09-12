---
title: The prove-it command
description: Ten steps against the live testnet, six of them attacks, with the saved output.
---

# The prove-it command

```bash
cd packages/server
npm run prove
```

One command, no mocks. It talks to a real Nimiq node, sends real testnet payments from a real
key, and either proves the product works or shows an attack being refused. Every run writes its
output to `docs/proofs/`.

Nimiq fees are zero and each step hands its test NIM back to the merchant wallet at the end, so
the run repeats without a faucet top-up. The run below started and finished with the same
2 NIM balance.

## What each step proves

| Step | What it does | What it proves |
|---|---|---|
| 1 | Boots the database, applies migrations, asks the node for its network and block height | The server is talking to the live chain, not a fixture. Everything below happens at a real block height |
| 2 | Seeds the demo merchant and one card, printing the code, the pay-to address and the memo | A card receives at the merchant's own wallet, and the memo a customer needs is derived from the card code |
| 3 | Waits for a payment sent from a real phone in Nimiq Pay, then reads it back from the chain | The core loop end to end: a wallet payment with a memo becomes one stamp, matched to the customer by the address that actually sent it (the remote account) |
| 4 | The merchant pays one of their own cards from another card's address, to farm stamps | A card always receives at its merchant's own wallet, and a sender the merchant controls is refused: `sender is merchant` |
| 5 | Claims the same transaction hash twice | One payment is one stamp. The unique index on the hash means a retry, a replay, or the watcher and the phone both seeing it still write one row |
| 6 | Pays half the card minimum | The per-card minimum is enforced against the chain value, not the claim: `below minimum` |
| 7 | Sends a valid login signature, then sends it again | Nonces are single use. The replay comes back `401 nonce used`, so a captured signature is worthless |
| 8 | Tries to redeem a card with one stamp of three | Progress is recomputed from stamps minus rewards already taken, on the server, at every step: `409 not redeemable yet`, with the real progress attached |
| 9 | A stranger reads and confirms another merchant's reward, then the real merchant confirms | Every redemption lookup is joined to the caller's own cards. The stranger gets `404 reward not found` twice and the owner still confirms |
| 10 | A stranger pays the cashback the merchant owes, then the merchant tries to mark it settled | Cashback is only settled by a payment that came from the merchant, to that customer, for at least the amount owed: `409 payment did not come from the merchant` |

Six of the ten steps are attacks. That is the point: a test suite that only shows the happy path
proves the product works for an honest user, not that it holds against a dishonest one. The
[threat model](../security/threat-model.md) lists what each attack maps to.

## What it does not cover

The run uses one merchant key and one payer key on testnet, so it proves the rules against a live
chain, not against load. Concurrency, the watcher's paging, and the property that consumed stamps
never exceed earned stamps are covered by the offline suite instead. Step 3 needs a human with a
phone, and skips with a keypress when there is not one.

## The saved output

From `docs/proofs/prove-20260912-1120.txt`. The merchant test wallet in this run is
`NQ63NLNX4H6RM3R4XB928Y1X5GTSJUGC5QFJ`, a throwaway testnet address, and the card code is
`5FQQ2J56`.

```text
Vango prove-it, 2026-09-12T05:46:07.014Z
Every step below either proves the product works or shows an attack being refused.

1. Boot: database, migrations and the live chain
   database   pglite
   migrations 0 applied, 2 already there
   network    TestAlbatross
   rpc        https://rpc.testnet.nimiqwatch.com
   block      11222678
   PASS  connected to TestAlbatross at block 11222678

2. Seed: the demo merchant and their card
   card    Vango Demo Cafe (already there)
   code    5FQQ2J56
   reward  Free coffee on visit 3
   pay to  NQ63NLNX4H6RM3R4XB928Y1X5GTSJUGC5QFJ
   memo    vango:5FQQ2J56
   PASS  demo card 5FQQ2J56 ready

3. A real payment from a phone becomes a stamp
   Pay 1 NIM from Nimiq Pay (testnet) to NQ63NLNX4H6RM3R4XB928Y1X5GTSJUGC5QFJ with memo vango:5FQQ2J56,
   or press Enter to skip
   hash   e37dde859da8f0e451769d7afba8a732e7e906f434d6afc9e55d409aa5940a08
   block  11222943
   sender NQ5492V5S1C3EAJFHVE6B2KB8U316D3DVUMC
   PASS  a live payment was read off the chain and stamped

4. Attack: the merchant pays their own counter to farm stamps
   counter card V53BJZ63 pays into NQ45YN8M7Y5VYQX95H10KXVSXM7VR736XPLD
   sent 1 NIM, hash cf1ca7c9be545760ba724bc3da80b5b774a36a6a3d74930dbbbe7f61126cf70f
   included in block 11222947
   engine says {"stamped":false,"reason":"sender is merchant"}
   sent 1 NIM, hash 8768fada24a2ef37f6150130e5680d5053ff82820af41de381b00f9151f38409
   included in block 11222950
   test NIM returned to the merchant in block 11222950
   PASS  refused: sender is merchant

5. Attack: the same payment claimed twice
   first claim  {"stamped":false,"reason":"already stamped"}
   second claim {"stamped":false,"reason":"already stamped"}
   PASS  refused: already stamped

6. Attack: a payment under the card minimum
   sent 0.5 NIM, hash e0203be79a806f79aafd2d5f8f3e01ffd314d3659b129dba58f6c45d69e430dc
   included in block 11222953
   sent 0.5 NIM, hash 7877ecb1140356bc121cb01ebdfee9912354c351252fb0578c374f03b13ccab4
   included in block 11222956
   engine says {"stamped":false,"reason":"below minimum"}
   PASS  refused: below minimum


Merchant wallet before the attacks 2 NIM, after 2 NIM.
Nimiq fees are zero and every test payment is handed back, so the run repeats.

7. Attack: a login signature sent twice
   first send  200
   replay      401 {"error":"nonce used"}
   PASS  refused: 401 nonce used

8. Attack: taking the reward before the card is full
   one stamp of three, start says 409 {"error":"not redeemable yet","progress":{"rewardKind":"nth_free","stamps":1,"target":3,"redeemable":false,"totalLuna":100000,"cashbackLuna":0}}
   PASS  refused: 409 not redeemable yet

9. Attack: a stranger confirming another merchant's reward
   stranger reads   404 {"error":"reward not found"}
   stranger confirms 404 {"error":"reward not found"}
   owner confirms   200 {"status":"confirmed"}
   PASS  refused: 404 reward not found, and the real merchant still confirms

10. Attack: settling cashback with a stranger's payment
   owed 20000 Luna, a stranger paid it, server says 409 {"error":"payment did not come from the merchant"}
   PASS  refused: 409 payment did not come from the merchant

11. Summary
   step  result   check
      1  PASS     Boot: database, migrations and the live chain
      2  PASS     Seed: the demo merchant and their card
      3  PASS     A real payment from a phone becomes a stamp
      4  PASS     Attack: the merchant pays their own counter to farm stamps
      5  PASS     Attack: the same payment claimed twice
      6  PASS     Attack: a payment under the card minimum
      7  PASS     Attack: a login signature sent twice
      8  PASS     Attack: taking the reward before the card is full
      9  PASS     Attack: a stranger confirming another merchant's reward
     10  PASS     Attack: settling cashback with a stranger's payment

prove-it finished, 10 of 10 checks passed
```
