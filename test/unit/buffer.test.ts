/**
 * trzsz2: https://github.com/trzsz/trzsz2
 * Copyright(c) 2024 trzsz2 contributors
 * @license MIT
 */

import { describe, test, expect } from 'vitest'
import { TrzszBuffer } from '../../src/buffer'

describe('TrzszBuffer', () => {
  describe('readLine', () => {
    test('should read line after add buffer', async () => {
      const tb = new TrzszBuffer()
      tb.addBuffer('test message\n')
      expect(await tb.readLine()).toBe('test message')
    })

    test('should read line before add buffer', async () => {
      const tb = new TrzszBuffer()
      setTimeout(() => tb.addBuffer('test message\n'), 100)
      expect(await tb.readLine()).toBe('test message')
    })

    test('should read line from two buffers', async () => {
      const tb = new TrzszBuffer()
      tb.addBuffer('test ')
      setTimeout(() => tb.addBuffer('message\n'), 100)
      expect(await tb.readLine()).toBe('test message')
    })

    test('should read lines from mix buffer', async () => {
      const tb = new TrzszBuffer()
      tb.addBuffer('test\nmessage\n')
      expect(await tb.readLine()).toBe('test')
      expect(await tb.readLine()).toBe('message')
    })

    test('should read multiple lines', async () => {
      const tb = new TrzszBuffer()
      tb.addBuffer('1test message1\n')
      tb.addBuffer('2test message2\n')
      expect(await tb.readLine()).toBe('1test message1')
      expect(await tb.readLine()).toBe('2test message2')
      tb.addBuffer('3test message3\n')
      expect(await tb.readLine()).toBe('3test message3')
    })

    test('should read a long line', async () => {
      const tb = new TrzszBuffer()
      const partA = 'A'.repeat(100)
      const partB = 'B'.repeat(200)
      const partC = 'C'.repeat(300)
      tb.addBuffer(partA)
      tb.addBuffer(partB)
      tb.addBuffer(partC)
      setTimeout(() => tb.addBuffer('D\n'), 100)
      expect(await tb.readLine()).toBe(partA + partB + partC + 'D')
    })

    test('should read line from blob', async () => {
      const tb = new TrzszBuffer()
      tb.addBuffer(new Blob(['test ']))
      setTimeout(() => tb.addBuffer(new Blob(['message\n'])), 100)
      expect(await tb.readLine()).toBe('test message')
    })

    test('should throw on interrupted', async () => {
      const tb = new TrzszBuffer()
      tb.addBuffer('test\x03message\n')
      await expect(tb.readLine()).rejects.toThrow('Interrupted')
      tb.addBuffer('test\nmessage\x03\n')
      expect(await tb.readLine()).toBe('test')
      await expect(tb.readLine()).rejects.toThrow('Interrupted')
    })
  })

  describe('readBinary', () => {
    test('should read binary after add buffer', async () => {
      const tb = new TrzszBuffer()
      const uint8 = new Uint8Array(300)
      for (let i = 0; i < uint8.length; i++) {
        uint8[i] = i & 0xff
      }
      tb.addBuffer(uint8.buffer)
      expect(await tb.readBinary(100)).toStrictEqual(uint8.subarray(0, 100))
      expect(await tb.readBinary(200)).toStrictEqual(uint8.subarray(100))
    })

    test('should read binary before add buffer', async () => {
      const tb = new TrzszBuffer()
      const uint8 = new Uint8Array(300)
      for (let i = 0; i < uint8.length; i++) {
        uint8[i] = i & 0xff
      }
      setTimeout(() => tb.addBuffer(uint8.buffer), 100)
      expect(await tb.readBinary(100)).toStrictEqual(uint8.subarray(0, 100))
      expect(await tb.readBinary(200)).toStrictEqual(uint8.subarray(100))
    })

    test('should read binary from two buffers', async () => {
      const tb = new TrzszBuffer()
      const uint8 = new Uint8Array(200)
      for (let i = 0; i < uint8.length; i++) {
        uint8[i] = i & 0xff
      }
      tb.addBuffer(uint8.subarray(0, 100))
      setTimeout(() => tb.addBuffer(uint8.buffer.slice(100)), 100)
      expect(await tb.readBinary(200)).toStrictEqual(uint8)
      tb.addBuffer(uint8.buffer)
      expect(await tb.readBinary(200)).toStrictEqual(uint8)
    })
  })

  describe('error handling', () => {
    test('should throw on unsupported buffer type', async () => {
      const tb = new TrzszBuffer()
      tb.addBuffer(123 as any)
      await expect(tb.readLine()).rejects.toThrow('not supported')
    })

    test('should stop while reading', async () => {
      const tb = new TrzszBuffer()
      setTimeout(() => tb.stopBuffer(), 100)
      await expect(tb.readLine()).rejects.toThrow('Stopped')
    })
  })

  describe('drainBuffer', () => {
    test('should drain buffer', async () => {
      const tb = new TrzszBuffer()
      tb.addBuffer('old message\n')
      tb.drainBuffer()
      tb.addBuffer('new message\n')
      expect(await tb.readLine()).toBe('new message')
    })
  })

  describe('readLineOnWindows', () => {
    test('should read line on windows', async () => {
      const tb = new TrzszBuffer()
      tb.addBuffer('#DATA:test message\t1+/=!')
      expect(await tb.readLineOnWindows()).toBe('#DATA:testmessage1+/=')
      tb.addBuffer('\x1b[01;32mABC\x1b[01;34mdef!\x1b[00m')
      expect(await tb.readLineOnWindows()).toBe('ABCdef')
      tb.addBuffer('\x1b[29CAAA\x1b[KBBB' + 'C'.repeat(200) + '!')
      expect(await tb.readLineOnWindows()).toBe('AAABBB' + 'C'.repeat(200))
    })

    test('should handle cursor home and duplicate characters', async () => {
      const tb = new TrzszBuffer()
      tb.addBuffer('\r\n\x1b[90C')
      tb.addBuffer('#SUCC:eJzy8XR29Qt21TMCBAAA//8')
      tb.addBuffer('\r\n\x1b[25;119H8MnwJk!')
      expect(await tb.readLineOnWindows()).toBe('#SUCC:eJzy8XR29Qt21TMCBAAA//8MnwJk')
    })

    test('should handle complex escape sequences', async () => {
      const tb = new TrzszBuffer()
      tb.addBuffer('\x1b[238X\x1b[238C\x1b[60;198H\x1b[?25h\x1b[H!\x1b[60;198H')
      tb.addBuffer('\x1b[?25l#SUCC:65536! \x08\x1b[?25h\x1b[?25lSoft\x1b[!pReset!')
      expect(await tb.readLineOnWindows()).toBe('#SUCC:65536')
      expect(await tb.readLineOnWindows()).toBe('SoftReset')
    })

    test('should handle more escape sequences', async () => {
      const tb = new TrzszBuffer()
      tb.addBuffer('U4bz/o\x08\x1b[?25h\x1b[?25l\x1b[Hp\x1b[60;238H\x1b[?25h\x1b[?25l\r\np7bu8!')
      expect(await tb.readLineOnWindows()).toBe('U4bz/op7bu8')
      tb.addBuffer('hnWwqzbHU\x1b[199X\x1b[199C\x1b[60;40H\x1b[?25h\x1b[?25lUUcczgV!')
      expect(await tb.readLineOnWindows()).toBe('hnWwqzbHUUUcczgV')
      tb.addBuffer('8yOf8lh\x08\x1b[?25h\x1b[?25l\x1b[Hb\x1b[60;238H\x1b[?25h\x1b[?25l\r\ni2Czew!')
      expect(await tb.readLineOnWindows()).toBe('8yOf8lhi2Czew')
    })

    test('should throw on interrupted', async () => {
      const tb = new TrzszBuffer()
      tb.addBuffer('test\x03message!')
      await expect(tb.readLineOnWindows()).rejects.toThrow('Interrupted')
    })
  })
})
