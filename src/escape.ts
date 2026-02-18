/**
 * trzsz2: https://github.com/zxdong262/trzsz2
 * Copyright(c) 2024 Lonny Wong
 * @license MIT
 *
 * Pure protocol implementation without fs/browser dependencies.
 */

/**
 * Get escape characters for trzsz protocol.
 * @param escapeAll - Whether to escape all special characters.
 * @return Array of escape character pairs.
 */
export function getEscapeChars (escapeAll: boolean): string[][] {
  const escapeChars: string[][] = [
    ['\xee', '\xee\xee'],
    ['\x7e', '\xee\x31']
  ]
  if (escapeAll) {
    const chars = '\x02\x0d\x10\x11\x13\x18\x1b\x1d\x8d\x90\x91\x93\x9d'
    for (let i = 0; i < chars.length; i++) {
      escapeChars.push([chars[i], '\xee' + String.fromCharCode(0x41 + i)])
    }
  }
  return escapeChars
}

/**
 * Convert escape characters to codes.
 * @param escapeChars - Array of escape character pairs.
 * @return Array of escape code triplets.
 */
export function escapeCharsToCodes (escapeChars: string[][]): number[][] {
  const escapeCodes: number[][] = []
  for (let i = 0; i < escapeChars.length; i++) {
    escapeCodes.push([
      escapeChars[i][0].charCodeAt(0),
      escapeChars[i][1].charCodeAt(0),
      escapeChars[i][1].charCodeAt(1)
    ])
  }
  return escapeCodes
}

/**
 * Escape data using escape codes.
 * @param data - The data to escape.
 * @param escapeCodes - Array of escape code triplets.
 * @return The escaped data.
 */
export function escapeData (data: Uint8Array, escapeCodes: number[][]): Uint8Array {
  if (escapeCodes.length === 0) {
    return data
  }

  const buf = new Uint8Array(data.length * 2)

  let idx = 0
  for (let i = 0; i < data.length; i++) {
    let escapeIdx = -1
    for (let j = 0; j < escapeCodes.length; j++) {
      if (data[i] === escapeCodes[j][0]) {
        escapeIdx = j
        break
      }
    }
    if (escapeIdx < 0) {
      buf[idx++] = data[i]
    } else {
      buf[idx++] = escapeCodes[escapeIdx][1]
      buf[idx++] = escapeCodes[escapeIdx][2]
    }
  }

  return buf.subarray(0, idx)
}

/**
 * Unescape data using escape codes.
 * @param data - The data to unescape.
 * @param escapeCodes - Array of escape code triplets.
 * @return The unescaped data.
 */
export function unescapeData (data: Uint8Array, escapeCodes: number[][]): Uint8Array {
  if (escapeCodes.length === 0) {
    return data
  }

  const buf = new Uint8Array(data.length)

  let idx = 0
  for (let i = 0; i < data.length; i++) {
    let escapeIdx = -1
    if (i < data.length - 1) {
      for (let j = 0; j < escapeCodes.length; j++) {
        if (data[i] === escapeCodes[j][1] && data[i + 1] === escapeCodes[j][2]) {
          escapeIdx = j
          break
        }
      }
    }
    if (escapeIdx < 0) {
      buf[idx++] = data[i]
    } else {
      buf[idx++] = escapeCodes[escapeIdx][0]
      i++
    }
  }

  return buf.subarray(0, idx)
}
