/**
 * trzsz2: https://github.com/trzsz/trzsz2
 * Copyright(c) 2024 trzsz2 contributors
 * @license MIT
 */

import { describe, test, expect } from 'vitest'
import { getEscapeChars, escapeCharsToCodes, escapeData, unescapeData } from '../../src/lib/escape'
import { strToUint8 } from '../../src/lib/comm'

describe('getEscapeChars', () => {
  test('should return basic escape chars when escapeAll is false', () => {
    const chars = getEscapeChars(false)
    expect(chars).toHaveLength(2)
    expect(chars[0]).toEqual(['\xee', '\xee\xee'])
    expect(chars[1]).toEqual(['\x7e', '\xee\x31'])
  })

  test('should return all escape chars when escapeAll is true', () => {
    const chars = getEscapeChars(true)
    expect(chars.length).toBeGreaterThan(2)
    expect(chars[0]).toEqual(['\xee', '\xee\xee'])
    expect(chars[1]).toEqual(['\x7e', '\xee\x31'])
    // Additional chars for escapeAll
    expect(chars[2]).toEqual(['\x02', '\xeeA'])
    expect(chars[3]).toEqual(['\x0d', '\xeeB'])
    expect(chars[4]).toEqual(['\x10', '\xeeC'])
  })
})

describe('escapeCharsToCodes', () => {
  test('should convert escape chars to codes', () => {
    const chars = getEscapeChars(false)
    const codes = escapeCharsToCodes(chars)
    expect(codes).toHaveLength(2)
    // First char: \xee -> \xee\xee
    expect(codes[0][0]).toBe(0xee)
    expect(codes[0][1]).toBe(0xee)
    expect(codes[0][2]).toBe(0xee)
    // Second char: \x7e -> \xee\x31
    expect(codes[1][0]).toBe(0x7e)
    expect(codes[1][1]).toBe(0xee)
    expect(codes[1][2]).toBe(0x31)
  })

  test('should handle empty array', () => {
    const codes = escapeCharsToCodes([])
    expect(codes).toHaveLength(0)
  })
})

describe('escapeData and unescapeData', () => {
  test('should escape and unescape data correctly', () => {
    const chars = getEscapeChars(false)
    const codes = escapeCharsToCodes(chars)

    // Test with data containing escape chars
    const original = strToUint8('test\xee\x7e\xee\x7edata')
    const escaped = escapeData(original, codes)
    const unescaped = unescapeData(escaped, codes)

    expect(unescaped).toStrictEqual(original)
  })

  test('should handle data without escape chars', () => {
    const chars = getEscapeChars(false)
    const codes = escapeCharsToCodes(chars)

    const original = strToUint8('hello world')
    const escaped = escapeData(original, codes)
    const unescaped = unescapeData(escaped, codes)

    expect(escaped).toStrictEqual(original)
    expect(unescaped).toStrictEqual(original)
  })

  test('should handle empty data', () => {
    const chars = getEscapeChars(false)
    const codes = escapeCharsToCodes(chars)

    const original = new Uint8Array(0)
    const escaped = escapeData(original, codes)
    const unescaped = unescapeData(escaped, codes)

    expect(escaped).toStrictEqual(original)
    expect(unescaped).toStrictEqual(original)
  })

  test('should handle escapeAll mode', () => {
    const chars = getEscapeChars(true)
    const codes = escapeCharsToCodes(chars)

    // Test with data containing all special chars
    const original = strToUint8('test\x02\x0d\x10\x11\x13\x18\x1b\x1d\x8d\x90\x91\x93\x9d\xee\x7e')
    const escaped = escapeData(original, codes)
    const unescaped = unescapeData(escaped, codes)

    expect(unescaped).toStrictEqual(original)
  })

  test('should return original data when no escape codes', () => {
    const original = strToUint8('test\xee\x7edata')
    const escaped = escapeData(original, [])
    const unescaped = unescapeData(escaped, [])

    expect(escaped).toStrictEqual(original)
    expect(unescaped).toStrictEqual(original)
  })

  test('should handle consecutive escape chars', () => {
    const chars = getEscapeChars(false)
    const codes = escapeCharsToCodes(chars)

    const original = strToUint8('\xee\xee\x7e\x7e')
    const escaped = escapeData(original, codes)
    const unescaped = unescapeData(escaped, codes)

    expect(unescaped).toStrictEqual(original)
  })

  test('should handle escape char at end', () => {
    const chars = getEscapeChars(false)
    const codes = escapeCharsToCodes(chars)

    const original = strToUint8('test\xee')
    const escaped = escapeData(original, codes)
    const unescaped = unescapeData(escaped, codes)

    expect(unescaped).toStrictEqual(original)
  })
})
