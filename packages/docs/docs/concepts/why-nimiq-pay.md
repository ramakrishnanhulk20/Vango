---
title: Why Nimiq Pay
description: The five wallet facts Vango is built on, and what it could not do anywhere else.
---

# Why Nimiq Pay

Vango is not a web app that happens to accept crypto. It only works because of five things
Nimiq Pay does, and it would fall apart on a wallet that did any of them differently.

## Memo payments

Nimiq lets a payment carry a short piece of data, and the Pay provider exposes it:

```ts
sendBasicTransactionWithData({ recipient, value: 100000, data: 'vango:5FQQ2J56' })
```

That memo is the whole trick. It turns an ordinary payment into a stamp for one named card,
with no separate "check in" step and nothing for the customer to remember. We verified it on
a real phone: the memo arrived on chain as `recipientData: 76616e676f3a7370696b65`, which is
the text back in hex.

## Native dialogs

Paying and signing happen in Pay's own dialogs, outside Vango's web view. Vango never
touches a key, a seed phrase or a password, and the customer approves every action in the
wallet they already trust. If the customer taps Cancel, the call throws an error whose
message is exactly `User rejected the request.` and Vango simply offers the button again.

## Signatures

`sign(message)` returns a hex public key and signature. The server verifies the Ed25519
signature over the Nimiq signed-message format and derives the address from the public key,
so a signature proves the caller holds that address. That single call is both the login and
the redemption receipt, which is why Vango needs no passwords and a reward cannot be faked
by whoever happens to be holding the phone at the counter.

## Zero fees

A Nimiq payment costs nothing to send. That is what makes a 1 NIM stamp sane: on a chain
with real fees, the fee on a coffee-sized payment would cost more than the coffee, and this
product would not exist. It also means our own proof runs can hand every test coin back and
repeat, which you can see in [the prove-it command](../developers/the-prove-it-command.md).

## The remote account

`listAccounts()` returns two addresses. The first is the visible wallet address, the second
is a contract Nimiq calls the remote account, which actually holds the money. A Nimiq core
developer confirmed it plainly: if you want a user's whole balance, you have to check both
addresses.

For Vango, the consequence is concrete. The **sender on chain is the remote account**, while
the **signature comes from the visible address**. Vango records both at login and matches an
incoming payment against either, so your stamp lands on your card. A build that only knew
the visible address would read every customer payment as a stranger's and stamp nothing.

## What Vango could not do on another wallet

- **Without memos**, a payment cannot say which card it belongs to. You would need a scanner
  at the counter or a login before every purchase.
- **With real fees**, a one-coffee stamp is not worth sending, and cashback of a few percent
  disappears into the fee.
- **Without a provider that signs messages**, redemption becomes a code the shop types in
  and any screenshot of it is as good as the reward.
- **Without native dialogs**, Vango would have to ask for a key or hold a balance, and it
  would then be exactly the thing it refuses to be: a custodian.
