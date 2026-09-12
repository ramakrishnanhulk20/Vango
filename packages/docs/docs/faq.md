---
title: FAQ
description: Ten questions people actually ask about Vango, answered short.
---

# FAQ

### Do I need to know anything about crypto?

No. If you can use Nimiq Pay to pay for a coffee, you can use Vango, because paying for the
coffee is the whole thing. There is no wallet to create, no seed phrase to write down and no
token to buy, and the only new word is "memo", which Vango fills in for you.

### What does a stamp cost?

One qualifying payment, which is 1 NIM by default and is set per card by the merchant. Nimiq
charges no fee, so nothing is added on top: the NIM you send is the NIM the shop receives. Vango
takes nothing.

### Can a shop fake stamps to look popular?

Not from its own wallet. A card always receives at the wallet that created it, and a payment sent
from the merchant's visible address, their remote account, or any of their own cards' addresses is
refused with `sender is merchant`. We prove it against the live chain in step 4 of
[the prove-it command](./developers/the-prove-it-command.md).

What a merchant could do is pay a real customer and ask them to pay it back with the memo. That
costs the merchant real NIM per stamp and earns them a vanity number, so we state it in the
[threat model](./security/threat-model.md) rather than pretend it is impossible.

### What if I cancel the dialog in my wallet?

Nothing happens and nothing is lost. Cancelling makes the wallet call fail with
`User rejected the request.`, and Vango simply shows the screen again with the same button. That
is true for login, for paying, and for redeeming.

### My wallet says syncing. Is something broken?

No. For a few seconds after Nimiq Pay starts, the wallet reports that it has not caught up with
the chain yet, even though the block number already looks right. Vango waits and re-checks before
it offers to pay. If the label stays for more than a few seconds, close Vango and open it again
from Pay.

### I have two phones. Do my stamps follow me?

Stamps follow the wallet, not the person. Two wallets are two customers, exactly as two paper
stamp cards in two pockets would be. If both phones hold the same Nimiq Pay wallet, the stamps are
the same stamps.

### The six-digit code did not work. Now what?

Most often the ten minutes ran out. Tap Redeem again and you get a fresh code. A code also only
works on the phone of the merchant who owns that card, so it cannot be read out to a different
shop, and repeated wrong attempts are rate limited. Nothing is consumed until the merchant
confirms, so a failed code never costs you the reward.

### What data does Vango collect about me?

Your wallet addresses, the language and currency your wallet reports, the stamps you have earned
and the rewards you have taken. No name, no email, no phone or device identifier. Your addresses
and your payments are public on the Nimiq chain anyway, which is exactly why they can be used as a
stamp card.

### Which network does this run on?

Whichever network your wallet is on, with one Vango deployment per network. Development and the
proof runs use the Nimiq testnet (`TestAlbatross`), where NIM is free from the faucet, and a
mainnet deployment reads mainnet. Testnet cards do not exist on mainnet and mainnet cards do not
exist on testnet.

### Can I use USDT or another currency?

Not in this version. Vango stamps a NIM payment, because NIM is the part of Nimiq Pay that carries
a memo and costs no fee, and both of those are what make a coffee-sized loyalty payment sensible.
On the EVM side of Pay there is also no safe way to test: even with Nimiq set to testnet, that side
still points at a live chain.
