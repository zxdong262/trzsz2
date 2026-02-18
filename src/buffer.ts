/**
 * trzsz2: https://github.com/zxdong262/trzsz2
 * Copyright(c) 2024 Lonny Wong
 * @license MIT
 *
 * Pure protocol implementation without fs/browser dependencies.
 */

import { strToUint8, uint8ToStr, TrzszError, isVT100End } from './comm'

/**
 * Check if a character is a trzsz letter.
 * @param c - The character code.
 * @return True if it's a trzsz letter.
 */
function isTrzszLetter (c: number): boolean {
  if (c >= 0x61 && c <= 0x7a) {
    // 'a' <= c && c <= 'z'
    return true
  }
  if (c >= 0x41 && c <= 0x5a) {
    // 'A' <= c && c <= 'Z'
    return true
  }
  if (c >= 0x30 && c <= 0x39) {
    // '0' <= c && c <= '9'
    return true
  }
  if (c === 0x23 || c === 0x3a || c === 0x2b || c === 0x2f || c === 0x3d) {
    // c == '#' || c == ':' || c == '+' || c == '/' || c == '='
    return true
  }
  return false
}

/**
 * TrzszBuffer class for handling buffer operations.
 */
export class TrzszBuffer {
  private bufArray: Array<string | ArrayBuffer | Uint8Array | Blob | null> = []
  private resolve: (() => void) | null = null
  private reject: ((err: Error) => void) | null = null
  private bufHead: number = 0
  private bufTail: number = 0
  private nextIdx: number = 0
  private nextBuf: Uint8Array | null = null
  private arrBuf: ArrayBuffer = new ArrayBuffer(128)

  /**
   * Add a buffer to the queue.
   * @param buf - The buffer to add.
   */
  public addBuffer (buf: string | ArrayBuffer | Uint8Array | Blob): void {
    this.bufArray[this.bufTail++] = buf
    if (this.resolve != null) {
      this.resolve()
      this.resolve = null
      this.reject = null
    }
  }

  /**
   * Stop the buffer and reject any pending operations.
   */
  public stopBuffer (): void {
    if (this.reject != null) {
      this.reject(new TrzszError('Stopped'))
      this.reject = null
      this.resolve = null
    }
  }

  /**
   * Drain all buffers.
   */
  public drainBuffer (): void {
    this.bufArray = []
    this.bufHead = 0
    this.bufTail = 0
  }

  /**
   * Convert a buffer to Uint8Array.
   * @param buf - The buffer to convert.
   * @return The resulting Uint8Array.
   */
  private async toUint8Array (buf: string | ArrayBuffer | Uint8Array | Blob): Promise<Uint8Array> {
    if (typeof buf === 'string') {
      return strToUint8(buf)
    } else if (buf instanceof ArrayBuffer) {
      return new Uint8Array(buf)
    } else if (buf instanceof Uint8Array) {
      return buf
    } else if (buf instanceof Blob) {
      const buffer = await buf.arrayBuffer()
      return new Uint8Array(buffer)
    } else {
      throw new TrzszError('The buffer type is not supported', null, true)
    }
  }

  /**
   * Get the next buffer.
   * @return The next buffer.
   */
  private async nextBuffer (): Promise<Uint8Array> {
    if ((this.nextBuf != null) && this.nextIdx < this.nextBuf.length) {
      return this.nextBuf.subarray(this.nextIdx)
    }
    if (this.bufHead === this.bufTail) {
      if (this.bufHead !== 0) {
        this.bufHead = 0
        this.bufTail = 0
      }
      await new Promise<void>((resolve, reject) => {
        this.resolve = resolve
        this.reject = reject
      })
    }
    const buf = this.bufArray[this.bufHead]
    this.bufArray[this.bufHead] = null
    this.bufHead++
    if (buf == null) {
      throw new TrzszError('Unexpected null buffer')
    }
    this.nextBuf = await this.toUint8Array(buf)
    this.nextIdx = 0
    return this.nextBuf
  }

  /**
   * Grow the buffer.
   * @param dst - The destination buffer.
   * @param idx - The current index.
   * @param min - The minimum size needed.
   * @return The grown buffer.
   */
  private growBuffer (dst: Uint8Array, idx: number, min: number): Uint8Array {
    const len = Math.max(dst.length * 2, idx + min)
    this.arrBuf = new ArrayBuffer(len)
    const buf = new Uint8Array(this.arrBuf)
    buf.set(dst.subarray(0, idx))
    return buf
  }

  /**
   * Append a buffer to another.
   * @param dst - The destination buffer.
   * @param idx - The current index.
   * @param src - The source buffer.
   * @return The resulting buffer.
   */
  private appendBuffer (dst: Uint8Array, idx: number, src: Uint8Array): Uint8Array {
    const buf = dst.length >= idx + src.length ? dst : this.growBuffer(dst, idx, src.length)
    buf.set(src, idx)
    return buf
  }

  /**
   * Read a line from the buffer.
   * @return The line.
   */
  public async readLine (): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    let buf = new Uint8Array(this.arrBuf) as Uint8Array
    let len = 0
    while (true) {
      let next = await this.nextBuffer()
      const newLineIdx = next.indexOf(0x0a) // '\n'
      if (newLineIdx >= 0) {
        this.nextIdx += newLineIdx + 1 // +1 to ignore the '\n'
        next = next.subarray(0, newLineIdx)
      } else {
        this.nextIdx += next.length
      }
      if (next.includes(0x03)) {
        // `ctrl + c` to interrupt
        throw new TrzszError('Interrupted')
      }
      buf = this.appendBuffer(buf, len, next)
      len += next.length
      if (newLineIdx >= 0) {
        return await uint8ToStr(buf.subarray(0, len))
      }
    }
  }

  /**
   * Read binary data from the buffer.
   * @param len - The length to read.
   * @return The binary data.
   */
  public async readBinary (len: number): Promise<Uint8Array> {
    if (this.arrBuf.byteLength < len) {
      this.arrBuf = new ArrayBuffer(len)
    }
    const buf = new Uint8Array(this.arrBuf, 0, len)
    let idx = 0
    while (idx < len) {
      const left = len - idx
      let next = await this.nextBuffer()
      if (next.length > left) {
        this.nextIdx += left
        next = next.subarray(0, left)
      } else {
        this.nextIdx += next.length
      }
      buf.set(next, idx)
      idx += next.length
    }
    return buf
  }

  /**
   * Read a line on Windows (handles VT100 escape sequences).
   * @return The line.
   */
  public async readLineOnWindows (): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    let buf = new Uint8Array(this.arrBuf) as Uint8Array
    let lastByte = 0x1b
    let skipVT100 = false
    let hasNewline = false
    let mayDuplicate = false
    let hasCursorHome = false
    let preHasCursorHome = false
    let idx = 0
    while (true) {
      let next = await this.nextBuffer()
      const newLineIdx = next.indexOf(0x21) // '!'
      if (newLineIdx >= 0) {
        this.nextIdx += newLineIdx + 1 // +1 to ignore the '!'
        next = next.subarray(0, newLineIdx)
      } else {
        this.nextIdx += next.length
      }
      for (let i = 0; i < next.length; i++) {
        const c = next[i]
        if (c === 0x03) {
          // `ctrl + c` to interrupt
          throw new TrzszError('Interrupted')
        }
        if (c === 0x0a) {
          hasNewline = true
        }
        if (skipVT100) {
          if (isVT100End(c)) {
            skipVT100 = false
            // moving the cursor may result in duplicate characters
            if (c === 0x48 && lastByte >= 0x30 && lastByte <= 0x39) {
              mayDuplicate = true
            }
          }
          if (lastByte === 0x5b && c === 0x48) {
            hasCursorHome = true
          }
          lastByte = c
        } else if (c === 0x1b) {
          skipVT100 = true
          lastByte = c
        } else if (isTrzszLetter(c)) {
          if (mayDuplicate) {
            mayDuplicate = false
            // skip the duplicate characters, e.g., the "8" in "8\r\n\x1b[25;119H8".
            if (hasNewline && idx > 0 && (c === buf[idx - 1] || preHasCursorHome)) {
              buf[idx - 1] = c
              continue
            }
          }
          if (idx >= buf.length) {
            buf = this.growBuffer(buf, idx, next.length)
          }
          buf[idx++] = c
          preHasCursorHome = hasCursorHome
          hasCursorHome = false
          hasNewline = false
        }
      }
      if (newLineIdx >= 0 && idx > 0 && !skipVT100) {
        return await uint8ToStr(buf.subarray(0, idx))
      }
    }
  }
}
