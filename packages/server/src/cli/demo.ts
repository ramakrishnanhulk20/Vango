import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KeyPair, PrivateKey } from '@nimiq/core'
import { config } from '../config.js'
import type { RedemptionView } from '../domain/redemptions.js'
import type { CardProgress } from '../domain/stamps.js'
import type { HeldCard } from '../domain/wallet.js'
import { formatAddress, normalizeAddress } from '../lib/address.js'
import { isCardCode } from '../lib/code.js'
import { isCode6, isRedemptionToken } from '../lib/tokens.js'
import { getBalance, lunaToNim } from '../nimiq/rpc.js'
import { sendWithData, waitForInclusion } from '../nimiq/send.js'
import { signWithKeyPair } from '../nimiq/verify.js'

const here = dirname(fileURLToPath(import.meta.url))
const serverRoot = resolve(here, '../..')

/**
 * The customer wallet this demo plays. The seed is kept so the same customer comes back
 * on every run: a card that reset to zero stamps each time would prove nothing. The
 * folder is git-ignored and the key only ever holds testnet NIM.
 */
export const customerSeedFile = resolve(serverRoot, '.data/demo-customer.json')

export const lastRedeemFile = resolve(serverRoot, '.data/demo-last-redeem.txt')

const ONE_NIM = 100000

const INCLUSION_TIMEOUT_MS = 120000

/** A cashback card has no target visit, so three payments is what the demo pays it. */
const CASHBACK_VISITS = 3

const apiBase = (process.env.API_URL ?? 'http://localhost:8787').replace(/\/+$/, '')

const USAGE = [
  'npm run demo -- customer <CARD_CODE> [--stamps N]             pay a counter and take the reward',
  'npm run demo -- confirm <code6-or-token> [--merchant-key HEX]  accept a reward as the merchant',
  'npm run demo -- status                                         addresses, balances, last reward',
].join('\n')

export type DemoArgs =
  | { command: 'customer'; code: string; stamps: number | null }
  | { command: 'confirm'; handle: string; merchantKey: string | null }
  | { command: 'status' }

export type ParsedArgs = { ok: true; args: DemoArgs } | { ok: false; error: string }

function splitFlag(item: string): { name: string; inline: string | null } {
  const at = item.indexOf('=')
  if (at === -1) return { name: item.slice(2), inline: null }
  return { name: item.slice(2, at), inline: item.slice(at + 1) }
}

/**
 * Reads the words after `npm run demo --`. Kept away from the network and the disk so
 * the tests can cover every refusal without a chain or an API in the loop.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv
  if (command === undefined) return { ok: false, error: 'name a demo to run: customer, confirm or status' }

  const flags = new Map<string, string>()
  const loose: string[] = []

  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index]
    if (item === undefined) continue

    if (!item.startsWith('--')) {
      loose.push(item)
      continue
    }

    const { name, inline } = splitFlag(item)
    if (name.length === 0) return { ok: false, error: `${item} is not a flag` }

    if (inline !== null) {
      flags.set(name, inline)
      continue
    }

    const next = rest[index + 1]
    if (next === undefined || next.startsWith('--')) return { ok: false, error: `--${name} needs a value` }
    flags.set(name, next)
    index += 1
  }

  if (command === 'customer') {
    const unknown = [...flags.keys()].find((name) => name !== 'stamps')
    if (unknown !== undefined) return { ok: false, error: `customer does not take --${unknown}` }
    if (loose.length === 0) return { ok: false, error: 'customer needs a card code, for example BCDFGHJK' }
    if (loose.length > 1) return { ok: false, error: 'customer takes one card code' }

    const code = (loose[0] ?? '').toUpperCase()
    if (!isCardCode(code)) return { ok: false, error: `${loose[0]} is not a card code` }

    const asked = flags.get('stamps')
    if (asked === undefined) return { ok: true, args: { command: 'customer', code, stamps: null } }

    const stamps = Number(asked)
    if (!Number.isInteger(stamps) || stamps < 1 || stamps > 20) {
      return { ok: false, error: `--stamps must be a whole number from 1 to 20, got ${asked}` }
    }
    return { ok: true, args: { command: 'customer', code, stamps } }
  }

  if (command === 'confirm') {
    const unknown = [...flags.keys()].find((name) => name !== 'merchant-key')
    if (unknown !== undefined) return { ok: false, error: `confirm does not take --${unknown}` }
    if (loose.length === 0) return { ok: false, error: 'confirm needs the six-digit code or the QR payload' }
    if (loose.length > 1) return { ok: false, error: 'confirm takes one code or payload' }

    const handle = loose[0] ?? ''
    const token = handle.startsWith('vango-redeem:') ? handle.slice('vango-redeem:'.length) : handle
    if (!isCode6(token) && !isRedemptionToken(token)) {
      return { ok: false, error: `${handle} is neither a six-digit code nor a reward token` }
    }

    const key = flags.get('merchant-key')
    if (key === undefined) return { ok: true, args: { command: 'confirm', handle, merchantKey: null } }
    if (!/^[0-9a-fA-F]{64}$/.test(key)) {
      return { ok: false, error: '--merchant-key must be 64 hex characters' }
    }
    return { ok: true, args: { command: 'confirm', handle, merchantKey: key } }
  }

  if (command === 'status') {
    if (flags.size > 0 || loose.length > 0) return { ok: false, error: 'status takes no arguments' }
    return { ok: true, args: { command: 'status' } }
  }

  return { ok: false, error: `${command} is not a demo, pick customer, confirm or status` }
}

type CustomerSeedFile = { seed: string; address: string; createdAt: string }

export type DemoCustomer = { keyPair: KeyPair; address: string; created: boolean; file: string }

function addressOf(keyPair: KeyPair): string {
  const address = normalizeAddress(keyPair.toAddress().toUserFriendlyAddress())
  if (!address) throw new Error('a key did not produce a Nimiq address')
  return address
}

function readCustomerSeed(file: string): string | null {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return null
  }

  // A file that is there but unreadable is never overwritten. The seed is the only way
  // back to whatever testnet NIM an earlier run left in that wallet.
  let parsed: Partial<CustomerSeedFile>
  try {
    parsed = JSON.parse(text) as Partial<CustomerSeedFile>
  } catch {
    throw new Error(`${file} is not readable JSON, move it aside to start a new demo customer`)
  }

  if (typeof parsed.seed !== 'string' || !/^[0-9a-f]{64}$/i.test(parsed.seed)) {
    throw new Error(`${file} does not hold a 64 character seed, move it aside to start a new demo customer`)
  }

  return parsed.seed
}

/** Same file in, same wallet out. Running it twice creates one customer, not two. */
export function loadDemoCustomer(file: string = customerSeedFile): DemoCustomer {
  const remembered = readCustomerSeed(file)
  if (remembered !== null) {
    const keyPair = KeyPair.derive(PrivateKey.fromHex(remembered))
    return { keyPair, address: addressOf(keyPair), created: false, file }
  }

  const seed = randomBytes(32).toString('hex')
  const keyPair = KeyPair.derive(PrivateKey.fromHex(seed))
  const address = addressOf(keyPair)
  const body: CustomerSeedFile = { seed, address, createdAt: new Date().toISOString() }

  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, 'utf8')

  return { keyPair, address, created: true, file }
}

export type LoginBody = {
  message: string
  publicKey: string
  signature: string
  visibleAddress: string
}

export type SignedBody = { message: string; publicKey: string; signature: string }

/** What POST /api/auth/verify wants: the challenge signed, plus the address it belongs to. */
export function loginBody(keyPair: KeyPair, message: string): LoginBody {
  const signed = signWithKeyPair(keyPair, message)
  return {
    message,
    publicKey: signed.publicKey,
    signature: signed.signature,
    visibleAddress: addressOf(keyPair),
  }
}

/** What POST /api/redeem/sign wants. The server already knows whose session this is. */
export function signedBody(keyPair: KeyPair, message: string): SignedBody {
  const signed = signWithKeyPair(keyPair, message)
  return { message, publicKey: signed.publicKey, signature: signed.signature }
}

let stepNumber = 0

function step(title: string): void {
  stepNumber += 1
  console.log('')
  console.log(`${stepNumber}. ${title}`)
}

function detail(line: string): void {
  console.log(`   ${line}`)
}

function summary(line: string): void {
  console.log('')
  console.log(line)
}

function stop(line: string): never {
  console.log('')
  console.log(line)
  process.exit(1)
}

type Reply<T> = { status: number; body: T; text: string }

async function api<T>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<Reply<T>> {
  // Fastify refuses a request that announces JSON and then carries nothing, so the
  // content type is set only when there is a body. Confirm sends none.
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`

  const response = await fetch(
    `${apiBase}${path}`,
    options.body === undefined ? { method, headers } : { method, headers, body: JSON.stringify(options.body) },
  ).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error)
    stop(`The API at ${apiBase} did not answer: ${reason}`)
  })

  const text = await response.text()
  let parsed: unknown = null
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null
  } catch {
    parsed = null
  }

  return { status: response.status, body: parsed as T, text }
}

function errorTextOf<T>(reply: Reply<T>): string {
  const asError = reply.body as { error?: unknown } | null
  if (asError !== null && typeof asError.error === 'string') return asError.error
  return reply.text.length > 0 ? reply.text : '(no body)'
}

/** Any refusal from the API ends the run, with the status and the server's own words. */
function expectOk<T>(reply: Reply<T>, what: string): T {
  if (reply.status >= 200 && reply.status < 300) return reply.body
  stop(`The API refused ${what}: HTTP ${reply.status} ${errorTextOf(reply)}`)
}

type CardView = {
  code: string
  name: string
  rewardKind: 'nth_free' | 'cashback'
  rewardText: string
  targetVisits: number | null
  cashbackBps: number | null
  minLuna: number
  receivingAddress: string
  memo: string
  active: boolean
}

type ClaimReply = {
  result: { stamped: true; cardCode: string; blockNumber: number } | { stamped: false; reason: string }
  progress?: CardProgress
}

type StartReply = { message: string; nonce: string; expiresAt: number }

type SignReply = { token: string; code6: string; expiresAt: string }

type ConfirmReply = { status: string; payTo?: string; amountLuna?: number; memo?: string }

type SettleReply = { status: string; cashbackTxHash: string }

function progressLine(standing: CardProgress): string {
  if (standing.rewardKind === 'cashback') {
    const ready = standing.redeemable ? 'ready to take' : 'nothing owed yet'
    return `spent ${lunaToNim(standing.totalLuna)} NIM, cashback owed ${lunaToNim(standing.cashbackLuna)} NIM, ${ready}`
  }
  const ready = standing.redeemable ? 'reward ready' : 'not full yet'
  return `${standing.stamps} of ${standing.target ?? '?'} stamps, ${ready}`
}

async function signIn(keyPair: KeyPair, who: string): Promise<string> {
  const challenge = expectOk(
    await api<{ message: string }>('POST', '/api/auth/challenge', { body: {} }),
    `a login challenge for the ${who}`,
  )
  const verified = expectOk(
    await api<{ token: string }>('POST', '/api/auth/verify', { body: loginBody(keyPair, challenge.message) }),
    `the ${who} login`,
  )
  detail(`signed in as the ${who} at ${formatAddress(addressOf(keyPair))}`)
  return verified.token
}

/**
 * The chain watcher runs alongside this script and often stamps a payment before the
 * claim lands, which is correct and answers "already stamped" with no progress attached.
 * The wallet read gives the same numbers either way.
 */
async function readProgress(token: string, code: string): Promise<CardProgress | null> {
  const me = expectOk(await api<{ held: HeldCard[] }>('GET', '/api/me', { token }), 'the wallet read')
  return me.held.find((card) => card.code === code)?.progress ?? null
}

async function payAndWait(
  keyPair: KeyPair,
  recipient: string,
  valueLuna: number,
  data: string,
): Promise<{ hash: string; blockNumber: number }> {
  const hash = await sendWithData({ keyPair, recipient, valueLuna, data })
  detail(`sent ${lunaToNim(valueLuna)} NIM, hash ${hash}`)

  const included = await waitForInclusion(hash, INCLUSION_TIMEOUT_MS)
  if (!included) stop(`Payment ${hash} did not reach a block in two minutes, so the run stops here.`)

  detail(`included in block ${included.blockNumber}`)
  return { hash: included.hash, blockNumber: included.blockNumber }
}

async function runCustomer(code: string, asked: number | null): Promise<void> {
  const customer = loadDemoCustomer()

  step('The demo customer wallet')
  detail(`address ${formatAddress(customer.address)}`)
  detail(customer.created ? `new wallet, seed written to ${customer.file}` : `reused from ${customer.file}`)

  step(`Read card ${code} from the API`)
  const card = expectOk(await api<CardView>('GET', `/api/cards/${encodeURIComponent(code)}`), `card ${code}`)
  detail(`${card.name}, reward "${card.rewardText}"`)
  detail(`pay to ${formatAddress(card.receivingAddress)} with memo ${card.memo}`)
  detail(`minimum ${lunaToNim(card.minLuna)} NIM per payment`)
  if (!card.active) stop(`Card ${code} is switched off, so a payment to it would not be stamped.`)

  const visits =
    asked ?? (card.rewardKind === 'cashback' ? CASHBACK_VISITS : (card.targetVisits ?? CASHBACK_VISITS))

  step('Fund the customer wallet if it is short')
  const held = await getBalance(customer.address).catch(() => 0)
  const needed = visits * card.minLuna + ONE_NIM
  detail(`holds ${lunaToNim(held)} NIM, ${visits} visits plus 1 NIM spare needs ${lunaToNim(needed)} NIM`)

  const merchantKey = KeyPair.derive(PrivateKey.fromHex(config.SPIKE_MERCHANT_PRIVATE_KEY))
  const merchantAddress = addressOf(merchantKey)

  if (held < needed) {
    const topUp = needed - held
    const merchantHolds = await getBalance(merchantAddress).catch(() => 0)
    if (merchantHolds < topUp) {
      stop(
        `The merchant test key ${formatAddress(merchantAddress)} holds ${lunaToNim(merchantHolds)} NIM and the top up needs ${lunaToNim(topUp)} NIM. Use the testnet faucet, or run again with fewer stamps.`,
      )
    }
    await payAndWait(merchantKey, customer.address, topUp, 'vango-demo: funding the customer')
  } else {
    detail('no funding needed')
  }

  step('Log the customer in through the API')
  const token = await signIn(customer.keyPair, 'customer')

  let standing: CardProgress | null = null

  for (let visit = 1; visit <= visits; visit += 1) {
    step(`Visit ${visit} of ${visits}: pay the counter and claim the stamp`)
    const paid = await payAndWait(customer.keyPair, card.receivingAddress, card.minLuna, card.memo)

    const claimed = expectOk(
      await api<ClaimReply>('POST', '/api/stamps/claim', { token, body: { hash: paid.hash } }),
      'the stamp claim',
    )

    if (claimed.result.stamped) detail(`stamped on card ${claimed.result.cardCode}`)
    else detail(`the server did not stamp it now: ${claimed.result.reason}`)

    standing = claimed.progress ?? (await readProgress(token, card.code))
    if (standing) detail(progressLine(standing))
    else detail('the wallet read shows no progress on this card yet')
  }

  if (!standing?.redeemable) {
    const where = standing ? progressLine(standing) : 'no progress read'
    summary(`Done: ${visits} payment${visits === 1 ? '' : 's'} on card ${card.code}, ${where}.`)
    return
  }

  step('Take the reward and sign for it')
  const started = expectOk(
    await api<StartReply>('POST', '/api/redeem/start', { token, body: { code: card.code } }),
    'the start of the reward',
  )
  const signed = expectOk(
    await api<SignReply>('POST', '/api/redeem/sign', {
      token,
      body: signedBody(customer.keyPair, started.message),
    }),
    'the signed reward',
  )

  const payload = `vango-redeem:${signed.token}`
  mkdirSync(dirname(lastRedeemFile), { recursive: true })
  writeFileSync(lastRedeemFile, `${payload}\n`, 'utf8')

  console.log('')
  console.log('   ============================================================')
  console.log(`   SIX-DIGIT CODE   ${signed.code6}`)
  console.log(`   QR PAYLOAD       ${payload}`)
  console.log(`   EXPIRES          ${signed.expiresAt}`)
  console.log('   ============================================================')
  detail(`payload also saved to ${lastRedeemFile}`)

  summary(
    `Done: card ${card.code} is full and a reward is waiting. Accept it with: npm run demo -- confirm ${signed.code6}`,
  )
}

async function runConfirm(handle: string, merchantKeyHex: string | null): Promise<void> {
  const merchantKey = KeyPair.derive(PrivateKey.fromHex(merchantKeyHex ?? config.SPIKE_MERCHANT_PRIVATE_KEY))

  step('Log the merchant in through the API')
  detail(
    merchantKeyHex === null
      ? 'using SPIKE_MERCHANT_PRIVATE_KEY from .env'
      : 'using the key given on the command line',
  )
  const token = await signIn(merchantKey, 'merchant')

  const where = `/api/redeem/${encodeURIComponent(handle)}`

  step('Read what the customer is offering')
  const view = expectOk(await api<RedemptionView>('GET', where, { token }), `the reward ${handle}`)
  detail(`status     ${view.status}`)
  detail(`card       ${view.cardName}`)
  detail(`reward     ${view.rewardText} (${view.rewardKind})`)
  detail(`customer   ${view.customer}`)
  detail(
    view.rewardKind === 'cashback'
      ? `cashback   ${lunaToNim(view.cashbackLuna)} NIM`
      : `stamps     ${view.stampsConsumed} to consume`,
  )
  detail(`expires    ${view.expiresAt ?? 'no expiry'}`)

  step('Confirm the reward')
  const confirmed = expectOk(await api<ConfirmReply>('POST', `${where}/confirm`, { token }), 'the confirmation')
  detail(`status ${confirmed.status}`)

  if (confirmed.payTo === undefined || confirmed.amountLuna === undefined) {
    summary(`Done: "${view.rewardText}" confirmed for ${view.customer}, status ${confirmed.status}.`)
    return
  }

  step('Pay the cashback the server asked for')
  detail(
    `pay ${lunaToNim(confirmed.amountLuna)} NIM to ${formatAddress(confirmed.payTo)} with memo ${confirmed.memo ?? '(none)'}`,
  )
  const paid = await payAndWait(merchantKey, confirmed.payTo, confirmed.amountLuna, confirmed.memo ?? '')

  step('Tell the API the cashback is paid')
  const settled = expectOk(
    await api<SettleReply>('POST', `${where}/paid`, { token, body: { hash: paid.hash } }),
    'the cashback settlement',
  )
  detail(`status ${settled.status}, payment ${settled.cashbackTxHash}`)

  summary(`Done: ${lunaToNim(confirmed.amountLuna)} NIM cashback paid to ${view.customer} and recorded.`)
}

async function runStatus(): Promise<void> {
  const customer = loadDemoCustomer()
  const merchantKey = KeyPair.derive(PrivateKey.fromHex(config.SPIKE_MERCHANT_PRIVATE_KEY))
  const merchantAddress = addressOf(merchantKey)

  step('The demo customer wallet')
  const customerBalance = await getBalance(customer.address).catch(() => 0)
  detail(`address ${formatAddress(customer.address)}`)
  detail(`balance ${lunaToNim(customerBalance)} NIM`)
  detail(customer.created ? `new wallet, seed written to ${customer.file}` : `seed at ${customer.file}`)

  step('The merchant test key')
  const merchantBalance = await getBalance(merchantAddress).catch(() => 0)
  detail(`address ${formatAddress(merchantAddress)}`)
  detail(`balance ${lunaToNim(merchantBalance)} NIM`)

  step('The last reward this demo created')
  let last: string | null = null
  try {
    last = readFileSync(lastRedeemFile, 'utf8').trim()
  } catch {
    last = null
  }
  detail(last === null || last.length === 0 ? 'none yet' : last)

  summary(`Done: customer holds ${lunaToNim(customerBalance)} NIM, merchant holds ${lunaToNim(merchantBalance)} NIM.`)
}

async function main(): Promise<void> {
  if (config.NIMIQ_NETWORK !== 'TestAlbatross') {
    stop(
      `The demo signs payments with local keys, so it runs on TestAlbatross only. NIMIQ_NETWORK is ${config.NIMIQ_NETWORK}.`,
    )
  }

  const parsed = parseArgs(process.argv.slice(2))
  if (!parsed.ok) {
    console.log(parsed.error)
    console.log('')
    console.log(USAGE)
    process.exit(1)
  }

  console.log(`Vango demo counterpart, ${new Date().toISOString()}`)
  console.log(`API ${apiBase}, network ${config.NIMIQ_NETWORK}, RPC ${config.NIMIQ_RPC_URL}`)

  if (parsed.args.command === 'customer') await runCustomer(parsed.args.code, parsed.args.stamps)
  else if (parsed.args.command === 'confirm') await runConfirm(parsed.args.handle, parsed.args.merchantKey)
  else await runStatus()
}

const runAsScript = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (runAsScript) {
  await main()
  process.exit(0)
}
