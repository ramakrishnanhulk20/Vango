---
title: For merchants
description: Open a card, choose a rule, share it, and hand over rewards at the counter.
---

# For merchants

You need a Nimiq Pay wallet and two minutes. There is no terminal to buy, no monthly fee,
and no deposit: money from your customers lands in your own wallet, not in ours.

## Create a card

Open Vango inside Nimiq Pay, sign in with one signature, and fill in four fields:

| Field | What it means |
|---|---|
| Name | What customers see, up to 40 characters, for example "Vango Demo Cafe" |
| Reward | Your own words for what they get, for example "Free coffee on visit 3" |
| Rule | Every Nth visit free, or cashback (see below) |
| Minimum | The smallest payment that counts as a visit, 1 NIM by default |

The card is created with a short code, and it **receives at your own wallet address**. You
do not get to type an address, and neither does anybody else. That is deliberate: an address
you do not control would send your customers' money to a stranger, and a second address of
your own would let you farm your own stamps.

## The two rule kinds

**Every Nth visit free.** Set a target between 2 and 20 visits. Each qualifying payment is
one stamp. When the count reaches the target, the customer can redeem, and those stamps are
used up so the card starts again.

**Cashback.** Set a share of every payment, from 0.01 percent up to 20 percent, and Vango
tracks what the customer has spent on the card. When they redeem, Vango tells you exactly
how much to pay and to which address. You pay it from your own wallet, and Vango verifies
that payment on the chain: it has to be included, go to that customer, be at least the
amount owed, and come from you.

## Share the card

The card page gives you a link, a QR code and the short code itself. Print the QR for the
counter, put the link in your bio, or read out the code. See
[Sharing a card](./sharing-a-card.md) for the exact forms.

You can pause a card at any time. A paused card stops accepting new stamps and stops the
watcher following it, while everything already earned stays valid.

## Redeem at the counter

1. The customer taps Redeem and shows you a QR code, or reads out six digits.
2. Open the redeem screen in Vango. Point the camera at the QR, or type the six digits.
3. You see the card name, the reward in your own words, the customer's address with most of
   it hidden, and how many stamps this uses.
4. Tap **Confirm**, hand over the coffee.

Only you can read or confirm a reward on your own cards. A stranger who types the same six
digits gets "reward not found", and we prove that against the live chain in
[the prove-it command](../developers/the-prove-it-command.md), step 9.

## Cashback payout

On a cashback card, confirming shows you the payout: the customer's address, the amount, and
a memo. Tap to pay it and Pay opens its normal send dialog. The reward is marked settled only
after the server has found that payment on the chain. One payment settles one reward, so a
retried tap cannot pay twice.

## What you should tell customers

Vango does not verify brands. Anyone can name a card anything, so customers see your wallet
address next to the card name. Put your card's QR somewhere physical in your shop, and let
that be the introduction.
