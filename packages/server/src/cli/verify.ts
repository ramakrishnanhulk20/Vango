import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { verifySignedMessage } from '../nimiq/verify.js'

const file = process.argv[2]

if (!file) {
  console.error('usage: npm run spike:verify -- <file.json>')
  process.exit(2)
}

const path = resolve(process.cwd(), file)

let body: unknown
try {
  body = JSON.parse(await readFile(path, 'utf8'))
} catch (error) {
  console.error(`could not read ${path}: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}

const result = verifySignedMessage(body as Parameters<typeof verifySignedMessage>[0])

if (result.ok) {
  console.log(`signature valid for ${result.address}`)
  process.exit(0)
}

console.log(result.reason)
process.exit(1)
