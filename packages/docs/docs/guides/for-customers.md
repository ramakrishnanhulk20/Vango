---
title: For customers
description: Open a card, pay and get stamped, watch your cards, take the reward.
---

# For customers

Four things to know, and you are done.

## Open a card

A shop hands you the card in one of three ways: a link, a QR code on the counter, or a short
code like `5FQQ2J56` you can type in Vango. All three land on the same page.

The card page is the honest part. Before you pay anything it shows you:

- what the reward is, in the shop's own words ("Free coffee on visit 3")
- which rule it follows: every Nth visit free, or cashback on every payment
- the smallest payment that counts as a visit, 1 NIM by default
- the address the money goes to, which is the shop's own wallet

## Pay and get stamped

Tap **Pay and stamp**. Nimiq Pay opens its normal send dialog with the amount and the memo
already filled in, and you confirm it there. The NIM goes straight from your wallet to the
shop's wallet. Nimiq charges no fee.

About a second later Vango reads your payment back off the chain and your card moves to
**1 of 5**. If you close Vango before that, nothing is lost: a watcher on the server sees
the same payment on its next pass and stamps the card for you. The same payment can never
be counted twice, no matter which one of them sees it first.

You can also pay the shop by hand from Pay, as long as you send at least the minimum to the
card's address with the memo exactly as shown. The stamp works the same way, because the
chain is what Vango reads.

## See your cards

The wallet screen lists every card you have ever been stamped on, with how far along you
are, what the reward is, and whether it is ready. A card stays in your wallet after you
take the reward, because the next visit starts it over.

## Redeem

1. When the card is full, tap **Redeem**.
2. Pay asks you to sign a short message naming that card. This is what proves the reward is
   yours and not a screenshot somebody else took.
3. Vango shows a QR code and a **six-digit code**, both good for ten minutes.
4. Show the QR to the shop, or read the six digits out. They see the card, the reward and
   your address with most of it hidden, then tap Confirm.
5. On a cashback card the shop then pays you from their own wallet, and Vango checks that
   payment on the chain before it calls the reward settled.

If the ten minutes run out, nothing is lost. Tap Redeem again and you get a fresh code.
