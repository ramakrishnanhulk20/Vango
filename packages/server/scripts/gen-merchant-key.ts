import { KeyPair } from '@nimiq/core'

const keyPair = KeyPair.generate()

console.log('SPIKE_MERCHANT_PRIVATE_KEY=' + keyPair.privateKey.toHex())
console.log('address=' + keyPair.toAddress().toUserFriendlyAddress())
console.log('publicKey=' + keyPair.publicKey.toHex())
console.log('')
console.log('Copy the private key line into D:/Projects/Nimiq/.env by hand. This script')
console.log('writes to no file on purpose, so a generated key can never land in git.')

process.exit(0)
