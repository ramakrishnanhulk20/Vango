/**
 * No CDN modules on this page. Inside the Pay WebView the qrcode +esm bundle asked our
 * own server for one of its dependencies, the import failed, and a failed import kills
 * the whole module before any button is wired. The SDK's init() is a 50ms poll for
 * window.nimiq, so it is reproduced here instead of imported.
 */
function waitForProvider(timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (window.nimiq) return resolve(window.nimiq)
      if (Date.now() - started > timeoutMs) return reject(new Error('Nimiq provider was not injected. Are you running inside a Nimiq app?'))
      setTimeout(tick, 50)
    }
    tick()
  })
}
const getHostLanguage = () => window.nimiqPay?.language
const getHostFiat = () => window.nimiqPay?.userFiat

const MERCHANT_VALUE_LUNA = 100000
const MEMO = 'vango:5FQQ2J56'
const QR_TEXT = 'vango-spike-qr'

const $ = (id) => document.getElementById(id)

function write(id, text, tone) {
  const box = $(id)
  box.textContent = text
  box.className = tone ?? ''
}

function append(id, text) {
  $(id).textContent += `\n${text}`
}

/**
 * The provider can fail two ways: it throws, or it resolves an ErrorResponse object.
 * A user tapping cancel on the native dialog shows up as PermissionDeniedError in
 * either shape, and that is not a bug worth a stack trace on a phone screen.
 */
function describe(error) {
  const name = error?.name ?? error?.error?.type ?? 'Error'
  const message = error?.message ?? error?.error?.message ?? String(error)
  if (/PermissionDenied/i.test(name) || /PermissionDenied/i.test(message)) return 'Cancelled in Nimiq Pay'
  return `${name}: ${message}`
}

async function guard(id, label, work) {
  try {
    return { ok: true, value: await work() }
  } catch (error) {
    write(id, `${label} failed\n${describe(error)}`, 'bad')
    return { ok: false }
  }
}

function unwrap(result) {
  if (result && typeof result === 'object' && result.error) throw result
  return result
}

async function api(path, body) {
  const response = await fetch(path, body === undefined
    ? {}
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await response.json().catch(() => ({}))
  return { status: response.status, json }
}

let provider = null

async function getProvider() {
  if (!provider) provider = await waitForProvider(10000)
  return provider
}

function showHost() {
  $('host-language').textContent = window.nimiqPay?.language ?? getHostLanguage() ?? 'not set'
  $('host-fiat').textContent = getHostFiat() ?? 'not set'
  $('host-provider').textContent = window.nimiq ? 'window.nimiq injected' : 'waiting for injection'
  $('host-secure').textContent = window.isSecureContext ? 'yes' : 'no (plain http)'
}

$('run-connect').addEventListener('click', async () => {
  write('out-connect', 'Waking the provider...')
  const result = await guard('out-connect', 'Connect', async () => {
    const nimiq = await getProvider()
    const accounts = unwrap(await nimiq.listAccounts())
    const consensus = unwrap(await nimiq.isConsensusEstablished())
    const height = unwrap(await nimiq.getBlockNumber())
    return { accounts, consensus, height }
  })
  if (!result.ok) return

  const { accounts, consensus, height } = result.value
  const lines = [`listAccounts returned ${accounts.length} address(es):`]
  accounts.forEach((address, index) => lines.push(`  [${index}] ${address}`))
  lines.push(`isConsensusEstablished: ${consensus}`)
  lines.push(`getBlockNumber: ${height}`)
  write('out-connect', lines.join('\n'), 'ok')
  showHost()
})

$('run-sign').addEventListener('click', async () => {
  write('out-sign', 'Asking the server for a challenge...')
  const result = await guard('out-sign', 'Sign', async () => {
    const challenge = await api('/api/spike/challenge', {})
    const message = challenge.json.message
    write('out-sign', `Challenge: ${message}\nWaiting for the wallet dialog...`)

    const nimiq = await getProvider()
    const accounts = unwrap(await nimiq.listAccounts())
    const signed = unwrap(await nimiq.sign(message))
    const verified = await api('/api/spike/verify', {
      address: accounts[0],
      publicKey: signed.publicKey,
      signature: signed.signature,
      message,
    })
    return { message, accounts, signed, verified }
  })
  if (!result.ok) return

  const { message, accounts, signed, verified } = result.value
  const lines = [
    `message: ${message}`,
    `claimed address: ${accounts[0]}`,
    `publicKey: ${signed.publicKey}`,
    `signature: ${signed.signature}`,
    `server said (${verified.status}): ${JSON.stringify(verified.json)}`,
  ]
  write('out-sign', lines.join('\n'), verified.json.ok ? 'ok' : 'bad')
})

const MAX_POLLS = 60

async function pollTransaction(hash, outId) {
  for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const tx = await api(`/api/spike/tx/${hash}`)
    if (tx.json.included) return tx.json
    append(outId, `poll ${attempt}: found=${tx.json.found} included=${tx.json.included}`)
  }
  append(outId, `gave up after ${MAX_POLLS} polls, the hash may still land later`)
  return null
}

$('run-pay').addEventListener('click', async () => {
  write('out-pay', 'Reading the merchant address...')
  const result = await guard('out-pay', 'Pay', async () => {
    const merchant = await api('/api/spike/merchant')
    const recipient = merchant.json.address
    write('out-pay', `Paying 1 NIM to ${recipient}\nWaiting for the wallet dialog...`)

    const nimiq = await getProvider()
    const hash = unwrap(await nimiq.sendBasicTransactionWithData({
      recipient,
      value: MERCHANT_VALUE_LUNA,
      data: MEMO,
    }))
    return { recipient, hash }
  })
  if (!result.ok) return

  const { recipient, hash } = result.value
  write('out-pay', [`recipient: ${recipient}`, `value: ${MERCHANT_VALUE_LUNA} Luna (1 NIM)`, `data: ${MEMO}`, `hash: ${hash}`, 'waiting for the chain...'].join('\n'))

  const included = await pollTransaction(hash, 'out-pay')
  if (!included) return
  append('out-pay', [
    `block: ${included.blockNumber}`,
    `sender on chain: ${included.sender}`,
    `recipient on chain: ${included.recipient}`,
    `value: ${included.valueLuna} Luna`,
    `memo the server decoded: ${included.memo ?? 'none'}`,
  ].join('\n'))
  $('out-pay').className = 'ok'
})

let scanner = null

function cameraHint() {
  const hasMedia = !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'
  if (!hasMedia) return 'No camera API, paste codes instead.'
  const secure = window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname)
  if (!secure) return 'Camera usually needs HTTPS. Paste works on plain http://.'
  return ''
}

async function stopScan() {
  if (!scanner) return
  try {
    await scanner.stop()
    await scanner.clear()
  } catch {
    // A camera that is already gone still has to leave the button in the right state.
  }
  scanner = null
  $('run-scan').textContent = 'Start camera'
}

$('run-scan').addEventListener('click', async () => {
  if (scanner) {
    await stopScan()
    append('out-scan', 'camera stopped')
    return
  }

  const hint = cameraHint()
  if (!navigator.mediaDevices?.getUserMedia) {
    write('out-scan', `navigator.mediaDevices.getUserMedia is missing\n${hint}`, 'bad')
    return
  }

  write('out-scan', 'Starting the rear camera...')
  scanner = new window.Html5Qrcode('scan-box')
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decoded) => {
        write('out-scan', `decoded: ${decoded}`, 'ok')
        void stopScan()
      },
      () => {},
    )
    $('run-scan').textContent = 'Stop camera'
    write('out-scan', 'Camera live. Point it at a QR code.')
  } catch (error) {
    scanner = null
    write('out-scan', `${describe(error)}${hint ? `\n${hint}` : ''}`, 'bad')
  }
})

$('run-qr').addEventListener('click', async () => {
  const result = await guard('out-qr', 'Show QR', async () => {
    const qr = window.qrcode(0, 'M')
    qr.addData(QR_TEXT)
    qr.make()
    $('qr-box').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2 })
    return QR_TEXT
  })
  if (!result.ok) return
  write('out-qr', `showing: ${QR_TEXT}`, 'ok')
})

showHost()
void getProvider().then(showHost).catch(() => {
  $('host-provider').textContent = 'not injected, open this inside Nimiq Pay'
})
