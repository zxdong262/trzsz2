/**
 * trzsz2: https://github.com/trzsz/trzsz2
 * Copyright(c) 2024 trzsz2 contributors
 * @license MIT
 */

import { describe, test, expect } from 'vitest'
import {
  strToUint8,
  strToArrBuf,
  uint8ToStr,
  encodeBuffer,
  decodeBuffer,
  checkDuplicateNames,
  isArrayOfType,
  stripServerOutput,
  TrzszError,
  formatSavedFiles,
  stripTmuxStatusLine,
  isVT100End,
  trzszVersion,
  TmuxMode
} from '../../src/comm'

describe('trzszVersion', () => {
  test('should have a version', () => {
    expect(trzszVersion).toBeDefined()
    expect(typeof trzszVersion).toBe('string')
  })
})

describe('strToUint8', () => {
  test('should convert string to Uint8Array', () => {
    const result = strToUint8('abc')
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBe(3)
    expect(result[0]).toBe(97) // 'a'
    expect(result[1]).toBe(98) // 'b'
    expect(result[2]).toBe(99) // 'c'
  })

  test('should handle empty string', () => {
    const result = strToUint8('')
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBe(0)
  })

  test('should handle special characters', () => {
    const str = '\x00\x01\xFF\xFE\xEE\xDD\xCC\xBB\xAA'
    const result = strToUint8(str)
    expect(result.length).toBe(9)
    expect(result[0]).toBe(0x00)
    expect(result[1]).toBe(0x01)
    expect(result[2]).toBe(0xFF)
  })
})

describe('uint8ToStr', () => {
  test('should convert Uint8Array to string', async () => {
    const arr = strToUint8('abc')
    const result = await uint8ToStr(arr)
    expect(result).toBe('abc')
  })

  test('should handle empty array', async () => {
    const result = await uint8ToStr(new Uint8Array(0))
    expect(result).toBe('')
  })

  test('should handle special characters', async () => {
    const str = '\x00\x01\xFF\xFE\xEE\xDD\xCC\xBB\xAA'
    const result = await uint8ToStr(strToUint8(str))
    expect(result).toBe(str)
  })

  test('should handle utf8 encoding', async () => {
    const str = '\xE4\xB8\xAD\xE6\x96\x87UTF8'
    const result = await uint8ToStr(strToUint8(str), 'utf8')
    expect(result).toBe('中文UTF8')
  })

  test('should work without Buffer', async () => {
    // This test requires FileReader API which is not available in Node.js
    // Skip this test in Node.js environment
    if (typeof FileReader === 'undefined') {
      return
    }
    const originalBuffer = global.Buffer
    // @ts-expect-error
    global.Buffer = undefined
    try {
      const str = '\xAB\xCD\xEF\xFE\xDC\xBA\x80\x81\x82\x83\x84'
      const result = await uint8ToStr(strToUint8(str))
      expect(result).toBe(str)
    } finally {
      global.Buffer = originalBuffer
    }
  })
})

describe('strToArrBuf', () => {
  test('should convert string to ArrayBuffer', () => {
    const result = strToArrBuf('abc')
    expect(result).toBeInstanceOf(ArrayBuffer)
    expect(result.byteLength).toBe(3)
  })

  test('should handle empty string', () => {
    const result = strToArrBuf('')
    expect(result).toBeInstanceOf(ArrayBuffer)
    expect(result.byteLength).toBe(0)
  })
})

describe('encodeBuffer and decodeBuffer', () => {
  test('should encode string to base64 with compression', () => {
    expect(encodeBuffer('abc')).toBe('eJxLTEoGAAJNASc=')
    expect(encodeBuffer('ABCDE')).toBe('eJxzdHJ2cQUAA+gBUA==')
  })

  test('should encode Uint8Array', () => {
    expect(encodeBuffer(strToUint8(''))).toBe('eJwDAAAAAAE=')
    expect(encodeBuffer(strToUint8('1'))).toBe('eJwzBAAAMgAy')
  })

  test('should decode base64 with decompression', () => {
    expect(decodeBuffer('eJxLTEoGAAJNASc=')).toStrictEqual(strToUint8('abc'))
    expect(decodeBuffer('eJxzdHJ2cQUAA+gBUA==')).toStrictEqual(strToUint8('ABCDE'))
    expect(decodeBuffer('eJwDAAAAAAE=')).toStrictEqual(strToUint8(''))
    expect(decodeBuffer('eJwzBAAAMgAy')).toStrictEqual(strToUint8('1'))
  })

  test('should be reversible', () => {
    const testStrings = ['hello world', 'test123', '']
    for (const str of testStrings) {
      const encoded = encodeBuffer(str)
      const decoded = decodeBuffer(encoded)
      expect(decoded).toStrictEqual(strToUint8(str))
    }
  })
})

describe('TrzszError', () => {
  test('should create basic error', () => {
    const err = new TrzszError('test error')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('TrzszError')
    expect(err.message).toBe('test error')
    expect(err.isTraceBack()).toBe(false)
    expect(err.isRemoteExit()).toBe(false)
    expect(err.isRemoteFail()).toBe(false)
  })

  test('should handle type parameter', () => {
    const err = new TrzszError('test error', 'custom')
    expect(err.message).toBe('[TrzszError] custom: test error')
  })

  test('should decode remote exit message', () => {
    const te = new TrzszError('eJwLLskvKEhNedo459naRQArrgcX', 'EXIT')
    expect(te.isTraceBack()).toBe(false)
    expect(te.isRemoteExit()).toBe(true)
    expect(te.isRemoteFail()).toBe(false)
    expect(TrzszError.getErrorMessage(te)).toBe('Stopped停止')
  })

  test('should handle remote fail with traceback', () => {
    const te = new TrzszError('eJxLS8zMUchNLS5OTE8FAB2fBKI=', 'FAIL', true)
    expect(te.isTraceBack()).toBe(true)
    expect(te.isRemoteExit()).toBe(false)
    expect(te.isRemoteFail()).toBe(true)
    expect(TrzszError.getErrorMessage(te)).toContain(' at ')
    expect(TrzszError.getErrorMessage(te)).toContain('fail message')
    expect(TrzszError.getErrorMessage(te)).not.toContain('TrzszError')
  })

  test('should handle remote fail without traceback', () => {
    const te = new TrzszError('eJxLS8zMUchNLS5OTE8FAB2fBKI=', 'fail', true)
    expect(te.isTraceBack()).toBe(false)
    expect(te.isRemoteExit()).toBe(false)
    expect(te.isRemoteFail()).toBe(true)
    expect(TrzszError.getErrorMessage(te)).toBe('fail message')
  })

  test('should handle decode failure', () => {
    const te = new TrzszError('fail message', 'fail', true)
    expect(te.isTraceBack()).toBe(false)
    expect(te.isRemoteExit()).toBe(false)
    expect(te.isRemoteFail()).toBe(true)
    expect(TrzszError.getErrorMessage(te)).toContain('error')
    expect(TrzszError.getErrorMessage(te)).toContain('fail message')
    expect(TrzszError.getErrorMessage(te)).not.toContain('undefined')
  })

  test('should handle other type with traceback', () => {
    const te = new TrzszError('fail message', 'other', true)
    expect(te.isTraceBack()).toBe(true)
    expect(te.isRemoteExit()).toBe(false)
    expect(te.isRemoteFail()).toBe(false)
    expect(TrzszError.getErrorMessage(te)).toContain('other')
    expect(TrzszError.getErrorMessage(te)).toContain('[TrzszError]')
    expect(TrzszError.getErrorMessage(te)).toContain('fail message')
  })

  test('should handle error without stack', () => {
    const err = new Error('fail message')
    err.stack = undefined
    expect(TrzszError.getErrorMessage(err)).toContain('fail message')
  })

  test('should detect stop and delete', () => {
    const te = new TrzszError(encodeBuffer('Stopped and deleted'), 'fail')
    expect(te.isStopAndDelete()).toBe(true)
  })

  test('should not detect stop and delete for other types', () => {
    const te = new TrzszError(encodeBuffer('Stopped and deleted'), 'FAIL')
    expect(te.isStopAndDelete()).toBe(false)
  })
})

describe('checkDuplicateNames', () => {
  const createFile = (path: string[]): import('../../src/comm').TrzszFileReader => ({
    getPathId: () => 0,
    getRelPath: () => path,
    isDir: () => true,
    getSize: () => 0,
    readFile: async () => new Uint8Array(0),
    closeFile: () => {}
  })

  test('should not throw for unique names', () => {
    const files = [createFile(['a', 'b', 'c'])]
    expect(() => checkDuplicateNames(files)).not.toThrow()
  })

  test('should throw for duplicate names', () => {
    const file = createFile(['a', 'b', 'c'])
    const files = [file, file]
    expect(() => checkDuplicateNames(files)).toThrow('Duplicate name')
  })

  test('should handle empty array', () => {
    expect(() => checkDuplicateNames([])).not.toThrow()
  })
})

describe('isArrayOfType', () => {
  test('should return true for empty array', () => {
    expect(isArrayOfType([], 'string')).toBe(true)
  })

  test('should return true for array of strings', () => {
    expect(isArrayOfType(['a'], 'string')).toBe(true)
    expect(isArrayOfType(['a', 'b', 'c'], 'string')).toBe(true)
  })

  test('should return false for non-array', () => {
    expect(isArrayOfType('a', 'string')).toBe(false)
    expect(isArrayOfType(123, 'number')).toBe(false)
  })

  test('should return false for mixed array', () => {
    expect(isArrayOfType(['a', 1], 'string')).toBe(false)
    expect(isArrayOfType(['a', 1], 'number')).toBe(false)
  })

  test('should work with numbers', () => {
    expect(isArrayOfType([1, 2, 3], 'number')).toBe(true)
    expect(isArrayOfType([1, 'a'], 'number')).toBe(false)
  })
})

describe('isVT100End', () => {
  test('should return true for lowercase letters', () => {
    for (let c = 0x61; c <= 0x7a; c++) {
      expect(isVT100End(c)).toBe(true)
    }
  })

  test('should return true for uppercase letters', () => {
    for (let c = 0x41; c <= 0x5a; c++) {
      expect(isVT100End(c)).toBe(true)
    }
  })

  test('should return false for other characters', () => {
    expect(isVT100End(0x30)).toBe(false) // '0'
    expect(isVT100End(0x39)).toBe(false) // '9'
    expect(isVT100End(0x1b)).toBe(false) // ESC
    expect(isVT100End(0x5b)).toBe(false) // '['
  })
})

describe('stripServerOutput', () => {
  test('should strip trailing newlines', () => {
    expect(stripServerOutput('trz\r\n')).toBe('trz')
    expect(stripServerOutput('trz -d\r\n')).toBe('trz -d')
  })

  test('should strip VT100 sequences', () => {
    expect(stripServerOutput('\x1b[29Ctrz\x1b[01;34m\r\n')).toBe('trz')
    expect(stripServerOutput('\x1b[29Ctrz\x1b[01;34m -d\r\n')).toBe('trz -d')
  })

  test('should handle bracketed paste mode', () => {
    expect(stripServerOutput('trz\r\n\u001b[?2004l\r')).toBe('trz')
  })

  test('should not strip short strings without VT100', () => {
    expect(stripServerOutput('\x08trz ')).toBe('\x08trz ')
  })

  test('should return Blob as-is', () => {
    const b = new Blob(['test'])
    expect(stripServerOutput(b)).toBe(b)
  })

  test('should handle ArrayBuffer', () => {
    const buf = strToArrBuf('trz\r\n')
    expect(stripServerOutput(buf)).toBe('trz')
  })

  test('should handle Uint8Array', () => {
    const arr = strToUint8('trz\r\n')
    expect(stripServerOutput(arr)).toBe('trz')
  })

  test('should not throw for long strings', () => {
    expect(() => stripServerOutput('A'.repeat(200000))).not.toThrow()
  })
})

describe('formatSavedFiles', () => {
  test('should format single file', () => {
    expect(formatSavedFiles(['a.txt'], '/tmp')).toBe('Saved 1 file/directory to /tmp\r\n- a.txt')
  })

  test('should format multiple files', () => {
    expect(formatSavedFiles(['a.txt', 'b.txt'], '.')).toBe('Saved 2 files/directories to .\r\n- a.txt\r\n- b.txt')
  })

  test('should handle empty destPath', () => {
    expect(formatSavedFiles(['a.txt', 'b.txt'], '')).toBe('Saved 2 files/directories\r\n- a.txt\r\n- b.txt')
  })
})

describe('stripTmuxStatusLine', () => {
  const P = '\x1bP=1s\x1b\\\x1b[?25l\x1b[?12l\x1b[?25h\x1b[5 q\x1bP=2s\x1b\\'

  test('should handle empty string', () => {
    expect(stripTmuxStatusLine('')).toBe('')
  })

  test('should return string without tmux sequences', () => {
    expect(stripTmuxStatusLine('ABC' + '123')).toBe('ABC123')
  })

  test('should strip tmux status line', () => {
    expect(stripTmuxStatusLine('ABC' + P + '123')).toBe('ABC123')
    expect(stripTmuxStatusLine('ABC' + P + '123' + P + 'XYZ')).toBe('ABC123XYZ')
    expect(stripTmuxStatusLine('ABC' + P + '123' + P + P + P + 'XYZ')).toBe('ABC123XYZ')
  })

  test('should handle partial tmux sequences', () => {
    for (let i = 0; i < P.length - 2; i++) {
      expect(stripTmuxStatusLine('ABC' + P + '123' + P.substring(0, P.length - i))).toBe('ABC123')
    }
  })
})

describe('TmuxMode', () => {
  test('should have correct values', () => {
    expect(TmuxMode.NoTmux).toBe(0)
    expect(TmuxMode.TmuxNormalMode).toBe(1)
    expect(TmuxMode.TmuxControlMode).toBe(2)
  })
})
