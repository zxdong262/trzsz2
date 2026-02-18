
import { vi } from 'vitest'

global.fetch = vi.fn()
global.WebSocket = vi.fn()

// Mock FileReader for browser-like behavior
class MockFileReader {
  result: string | ArrayBuffer | null = null
  onloadend: (() => void) | null = null
  onerror: (() => void) | null = null

  readAsBinaryString (blob: Blob): void {
    void blob.arrayBuffer().then(buffer => {
      const arr = new Uint8Array(buffer)
      this.result = String.fromCharCode(...arr)
      if (this.onloadend != null) this.onloadend()
    })
  }

  readAsText (blob: Blob, encoding?: string): void {
    void blob.arrayBuffer().then(buffer => {
      const arr = new Uint8Array(buffer)
      this.result = new TextDecoder(encoding ?? 'utf-8').decode(arr)
      if (this.onloadend != null) this.onloadend()
    })
  }

  readAsArrayBuffer (blob: Blob): void {
    void blob.arrayBuffer().then(buffer => {
      this.result = buffer
      if (this.onloadend != null) this.onloadend()
    })
  }
}

global.FileReader = MockFileReader as any

Object.defineProperty(global, 'window', {
  value: {
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    location: {
      href: ''
    }
  },
  writable: true
})

Object.defineProperty(global, 'document', {
  value: {
    createElement: vi.fn(),
    querySelector: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  },
  writable: true
})

Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Node.js)'
  },
  writable: true
})
