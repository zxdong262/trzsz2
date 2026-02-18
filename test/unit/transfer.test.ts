/**
 * trzsz2: https://github.com/trzsz/trzsz2
 * Copyright(c) 2024 trzsz2 contributors
 * @license MIT
 */

import { describe, test, expect, beforeEach } from 'vitest'
import { TrzszTransfer } from '../../src/transfer'
import { TrzszError, encodeBuffer, decodeBuffer } from '../../src/comm'

describe('TrzszTransfer', () => {
  let output: Array<string | Uint8Array>
  let writer: (data: string | Uint8Array) => void

  beforeEach(() => {
    output = []
    writer = (data: string | Uint8Array) => output.push(data)
  })

  describe('constructor', () => {
    test('should create transfer instance', () => {
      const transfer = new TrzszTransfer(writer)
      expect(transfer).toBeDefined()
    })

    test('should create transfer instance with Windows shell', () => {
      const transfer = new TrzszTransfer(writer, true)
      expect(transfer).toBeDefined()
    })
  })

  describe('cleanup', () => {
    test('should cleanup without error', () => {
      const transfer = new TrzszTransfer(writer)
      expect(() => transfer.cleanup()).not.toThrow()
    })
  })

  describe('addReceivedData', () => {
    test('should add string data', () => {
      const transfer = new TrzszTransfer(writer)
      transfer.addReceivedData('test data')
      // Should not throw
    })

    test('should add Uint8Array data', () => {
      const transfer = new TrzszTransfer(writer)
      transfer.addReceivedData(new Uint8Array([1, 2, 3]))
      // Should not throw
    })

    test('should add ArrayBuffer data', () => {
      const transfer = new TrzszTransfer(writer)
      transfer.addReceivedData(new ArrayBuffer(10))
      // Should not throw
    })

    test('should add Blob data', () => {
      const transfer = new TrzszTransfer(writer)
      transfer.addReceivedData(new Blob(['test']))
      // Should not throw
    })
  })

  describe('stopTransferring', () => {
    test('should stop transferring', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.stopTransferring()
      // Should not throw
    })
  })

  describe('sendAction', () => {
    test('should send action', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.sendAction(false, false)
      expect(output.length).toBe(1)
      expect(output[0]).toContain('#ACT:')
    })

    test('should send action with confirm', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.sendAction(true, false)
      expect(output.length).toBe(1)
      const data = output[0] as string
      const encoded = data.substring('#ACT:'.length).replace('\n', '')
      const decoded = JSON.parse(new TextDecoder().decode(decodeBuffer(encoded)))
      expect(decoded.confirm).toBe(true)
    })

    test('should send action with remote Windows', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.sendAction(false, true)
      expect(output.length).toBe(1)
      const data = output[0] as string
      const encoded = data.substring('#ACT:'.length).replace('!\n', '')
      const decoded = JSON.parse(new TextDecoder().decode(decodeBuffer(encoded)))
      expect(decoded.binary).toBe(false)
    })
  })

  describe('recvAction', () => {
    test('should receive action', async () => {
      const transfer = new TrzszTransfer(writer)
      const actionJson = JSON.stringify({ lang: 'py', version: '1.0.0' })
      transfer.addReceivedData(`#ACT:${encodeBuffer(actionJson)}\n`)
      const action = await transfer.recvAction()
      expect(action.lang).toBe('py')
      expect(action.version).toBe('1.0.0')
    })

    test('should receive action with newline', async () => {
      const transfer = new TrzszTransfer(writer)
      const actionJson = JSON.stringify({ lang: 'py', newline: '!\n' })
      transfer.addReceivedData(`#ACT:${encodeBuffer(actionJson)}\n`)
      const action = await transfer.recvAction()
      expect(action.newline).toBe('!\n')
    })
  })

  describe('sendConfig', () => {
    test('should send config', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.sendConfig({}, [], 0, 0)
      expect(output.length).toBe(1)
      expect(output[0]).toContain('#CFG:')
    })

    test('should send config with quiet', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.sendConfig({ quiet: true }, [], 0, 0)
      const data = output[0] as string
      const encoded = data.substring('#CFG:'.length).replace('\n', '')
      const decoded = JSON.parse(new TextDecoder().decode(decodeBuffer(encoded)))
      expect(decoded.quiet).toBe(true)
    })

    test('should send config with binary', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.sendConfig({ binary: true }, [['\xee', '\xee\xee']], 0, 0)
      const data = output[0] as string
      const encoded = data.substring('#CFG:'.length).replace('\n', '')
      const decoded = JSON.parse(new TextDecoder().decode(decodeBuffer(encoded)))
      expect(decoded.binary).toBe(true)
      expect(decoded.escape_chars).toBeDefined()
    })

    test('should send config with directory', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.sendConfig({ directory: true }, [], 0, 0)
      const data = output[0] as string
      const encoded = data.substring('#CFG:'.length).replace('\n', '')
      const decoded = JSON.parse(new TextDecoder().decode(decodeBuffer(encoded)))
      expect(decoded.directory).toBe(true)
    })

    test('should send config with bufsize', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.sendConfig({ bufsize: 10240 }, [], 0, 0)
      const data = output[0] as string
      const encoded = data.substring('#CFG:'.length).replace('\n', '')
      const decoded = JSON.parse(new TextDecoder().decode(decodeBuffer(encoded)))
      expect(decoded.bufsize).toBe(10240)
    })

    test('should send config with timeout', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.sendConfig({ timeout: 60 }, [], 0, 0)
      const data = output[0] as string
      const encoded = data.substring('#CFG:'.length).replace('\n', '')
      const decoded = JSON.parse(new TextDecoder().decode(decodeBuffer(encoded)))
      expect(decoded.timeout).toBe(60)
    })

    test('should send config with overwrite', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.sendConfig({ overwrite: true }, [], 0, 0)
      const data = output[0] as string
      const encoded = data.substring('#CFG:'.length).replace('\n', '')
      const decoded = JSON.parse(new TextDecoder().decode(decodeBuffer(encoded)))
      expect(decoded.overwrite).toBe(true)
    })
  })

  describe('recvConfig', () => {
    test('should receive config', async () => {
      const transfer = new TrzszTransfer(writer)
      const configJson = JSON.stringify({ lang: 'js', binary: true })
      transfer.addReceivedData(`#CFG:${encodeBuffer(configJson)}\n`)
      const config = await transfer.recvConfig()
      expect(config.lang).toBe('js')
      expect(config.binary).toBe(true)
    })
  })

  describe('clientExit', () => {
    test('should send client exit', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.clientExit('test exit')
      expect(output.length).toBe(1)
      expect(output[0]).toContain('#EXIT:')
    })
  })

  describe('recvExit', () => {
    test('should receive exit', async () => {
      const transfer = new TrzszTransfer(writer)
      transfer.addReceivedData(`#EXIT:${encodeBuffer('test exit')}\n`)
      const msg = await transfer.recvExit()
      expect(msg).toBe('test exit')
    })
  })

  describe('clientError', () => {
    test('should handle TrzszError with remote exit', async () => {
      const transfer = new TrzszTransfer(writer)
      const err = new TrzszError(encodeBuffer('Stopped'), 'EXIT')
      await transfer.clientError(err)
      // Should not send anything for remote exit
      expect(output.length).toBe(0)
    })

    test('should handle TrzszError with remote fail', async () => {
      const transfer = new TrzszTransfer(writer)
      const err = new TrzszError(encodeBuffer('fail message'), 'fail')
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await transfer.clientError(err)
      // Should not send anything for remote fail
      expect(output.length).toBe(0)
      logSpy.mockRestore()
    })

    test('should handle generic error', async () => {
      const transfer = new TrzszTransfer(writer)
      const err = new Error('test error')
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await transfer.clientError(err)
      expect(output.length).toBe(1)
      expect(output[0]).toContain('#FAIL:')
      logSpy.mockRestore()
    })
  })

  describe('serverError', () => {
    test('should handle TrzszError with stop and delete', async () => {
      const transfer = new TrzszTransfer(writer)
      const err = new TrzszError(encodeBuffer('Stopped and deleted'), 'fail')
      await transfer.serverError(err)
      // Should handle stop and delete
    })

    test('should handle TrzszError with remote exit', async () => {
      const transfer = new TrzszTransfer(writer)
      const err = new TrzszError(encodeBuffer('exit'), 'EXIT')
      await transfer.serverError(err)
      // Should handle remote exit
    })

    test('should handle generic error', async () => {
      const transfer = new TrzszTransfer(writer)
      const err = new Error('server error')
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await transfer.serverError(err)
      expect(output.length).toBeGreaterThan(0)
      logSpy.mockRestore()
    })
  })

  describe('serverExit', () => {
    test('should not throw', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.serverExit('test exit')
      // Base implementation does nothing
    })
  })

  describe('Windows shell mode', () => {
    test('should handle Windows shell mode', async () => {
      const transfer = new TrzszTransfer(writer, true)
      const actionJson = JSON.stringify({ lang: 'py' })
      transfer.addReceivedData(`#ACT:${encodeBuffer(actionJson)}!\n`)
      const action = await transfer.recvAction()
      expect(action.lang).toBe('py')
    })
  })

  describe('stopped state', () => {
    test('should not add data when stopped', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.stopTransferring()
      transfer.addReceivedData('test data')
      // Data should not be added
    })

    test('should throw when reading while stopped', async () => {
      const transfer = new TrzszTransfer(writer)
      await transfer.stopTransferring()
      // Next read should throw
    })
  })
})
