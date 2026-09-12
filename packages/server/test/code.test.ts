// Covers code generation and the memo format only. It does NOT cover whether Nimiq Pay
// shows the memo in its confirmation dialog, which is undocumented, and it does NOT
// prove codes are unique in the database: that is the unique index, tested in
// cards.test.ts.

import { describe, expect, it } from 'vitest'
import { CODE_ALPHABET, CODE_LENGTH, generateCode, isCardCode, parseMemo } from '../src/lib/code.js'

describe('generateCode', () => {
  it('makes eight characters that cannot be misread', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateCode()
      expect(code).toHaveLength(CODE_LENGTH)
      expect(code).toMatch(/^[0-9BCDFGHJKMNPQRSTVWXYZ]{8}$/)
      expect(isCardCode(code)).toBe(true)
    }
  })

  it('leaves out the characters that look like each other and the vowels', () => {
    for (const banned of ['A', 'E', 'I', 'L', 'O', 'U']) {
      expect(CODE_ALPHABET).not.toContain(banned)
    }
  })

  it('does not repeat itself over a thousand cards', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i += 1) seen.add(generateCode())

    expect(seen.size).toBe(1000)
  })
})

describe('parseMemo', () => {
  it('reads the card code out of the memo a customer pays with', () => {
    expect(parseMemo('vango:9BCDFGHJ')).toBe('9BCDFGHJ')
    expect(parseMemo('VANGO:9bcdfghj')).toBe('9BCDFGHJ')
    expect(parseMemo(' vango:9BCDFGHJ ')).toBe('9BCDFGHJ')
  })

  it('ignores a memo that is not ours', () => {
    expect(parseMemo('')).toBeNull()
    expect(parseMemo('thanks!')).toBeNull()
    expect(parseMemo('vango:')).toBeNull()
    expect(parseMemo('vango:9BCDFGH')).toBeNull()
    expect(parseMemo('vango:9BCDFGHJK')).toBeNull()
    expect(parseMemo('pay vango:9BCDFGHJ now')).toBeNull()
    expect(parseMemo(null)).toBeNull()
  })
})
