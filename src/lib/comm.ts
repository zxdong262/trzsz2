/**
 * trzsz2: https://github.com/zxdong262/trzsz2
 * Copyright(c) 2024 Lonny Wong
 * @license MIT
 *
 * Pure protocol implementation without fs/browser dependencies.
 */

import Pako from 'pako'

/**
 * trzsz version
 */
export const trzszVersion = '2.0.0'

/**
 * Convert a string to Uint8Array.
 * @param {string} str - The input string.
 * @return {Uint8Array} The resulting Uint8Array.
 */
export function strToUint8 (str: string): Uint8Array {
  return Uint8Array.from(str, (v) => v.charCodeAt(0))
}

/**
 * Convert a string to Uint8Array using UTF-8 encoding.
 * @param {string} str - The input string.
 * @return {Uint8Array} The resulting UTF-8 encoded Uint8Array.
 */
export function strToUtf8 (str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

/**
 * Convert a Uint8Array to string.
 * @param {Uint8Array} buf - The input buffer.
 * @param {string} encoding - The encoding to use.
 * @return {Promise<string>} The resulting string.
 */
export async function uint8ToStr (buf: Uint8Array, encoding: string = 'binary'): Promise<string> {
  if (typeof Buffer === 'function') {
    return Buffer.from(buf).toString(encoding as BufferEncoding)
  }
  return await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    // Create a new ArrayBuffer copy to avoid SharedArrayBuffer issues
    const arrayBuffer = new ArrayBuffer(buf.byteLength)
    new Uint8Array(arrayBuffer).set(buf)
    const blob = new Blob([arrayBuffer])
    if (encoding === 'binary') {
      reader.readAsBinaryString(blob)
    } else {
      reader.readAsText(blob, encoding)
    }
  })
}

/**
 * Convert a string to ArrayBuffer.
 * @param {string} str - The input string.
 * @return {ArrayBuffer} The resulting ArrayBuffer.
 */
export function strToArrBuf (str: string): ArrayBuffer {
  const arr = strToUint8(str)
  // Create a new ArrayBuffer copy to avoid SharedArrayBuffer issues
  const buffer = new ArrayBuffer(arr.byteLength)
  new Uint8Array(buffer).set(arr)
  return buffer
}

const _hasBuffer = typeof Buffer === 'function'

// Lazy load Node.js zlib module
let _nodeZlib: typeof import('zlib') | null | undefined

/**
 * Get Node.js zlib module if available.
 * @return {typeof import('zlib') | null} The zlib module or null if not available.
 */
function getNodeZlib (): typeof import('zlib') | null {
  if (_nodeZlib === undefined) {
    try {
      // Use dynamic require for Node.js environment
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      _nodeZlib = require('zlib')
    } catch {
      _nodeZlib = null
    }
  }
  return _nodeZlib ?? null
}

/**
 * Encode Uint8Array to base64 string using native functions.
 * @param {Uint8Array} buffer - The input buffer.
 * @return {string} The base64 encoded string.
 */
function uint8ToBase64 (buffer: Uint8Array): string {
  if (_hasBuffer) {
    return Buffer.from(buffer).toString('base64')
  }
  // Browser: use btoa with binary string
  let binary = ''
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i])
  }
  return btoa(binary)
}

/**
 * Decode base64 string to Uint8Array using native functions.
 * @param {string} base64 - The base64 encoded string.
 * @return {Uint8Array} The decoded buffer.
 */
function base64ToUint8 (base64: string): Uint8Array {
  if (_hasBuffer) {
    return Buffer.from(base64, 'base64')
  }
  // Browser: use atob and convert to Uint8Array
  const binary = atob(base64)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i)
  }
  return buffer
}

/**
 * Compress data using deflate algorithm.
 * Uses Node.js native zlib in Node.js, pako in browser.
 * @param {string | Uint8Array} data - The data to compress.
 * @return {Uint8Array} The compressed data.
 */
function deflate (data: string | Uint8Array): Uint8Array {
  const input = typeof data === 'string' ? strToUint8(data) : data

  // Try Node.js native zlib first
  const zlib = getNodeZlib()
  if (zlib != null) {
    // Use deflateSync (zlib format) to match pako's default behavior
    const result = zlib.deflateSync(input)
    // Convert Buffer to Uint8Array for consistency
    return new Uint8Array(result)
  }

  // Fall back to pako for browser
  return Pako.deflate(input)
}

/**
 * Decompress data using inflate algorithm.
 * Uses Node.js native zlib in Node.js, pako in browser.
 * @param {Uint8Array} data - The compressed data.
 * @return {Uint8Array} The decompressed data.
 */
function inflate (data: Uint8Array): Uint8Array {
  // Try Node.js native zlib first
  const zlib = getNodeZlib()
  if (zlib != null) {
    // Use inflateSync (zlib format) to match pako's default behavior
    const result = zlib.inflateSync(data)
    // Convert Buffer to Uint8Array for consistency
    return new Uint8Array(result)
  }

  // Fall back to pako for browser
  return Pako.inflate(data)
}

/**
 * Encode a buffer (compress and base64).
 * @param {string | Uint8Array} buf - The input buffer.
 * @return {string} The encoded string.
 */
export function encodeBuffer (buf: string | Uint8Array): string {
  const buffer = deflate(buf)
  return uint8ToBase64(buffer)
}

/**
 * Decode a buffer (base64 and decompress).
 * @param {string} buf - The encoded string.
 * @return {Uint8Array} The decoded buffer.
 */
export function decodeBuffer (buf: string): Uint8Array {
  const buffer = base64ToUint8(buf)
  return inflate(buffer)
}

/**
 * Custom error class for trzsz operations.
 */
export class TrzszError extends Error {
  private readonly type: string | null
  private readonly trace: boolean

  constructor (message: string, type: string | null = null, trace: boolean = false) {
    if (type === 'fail' || type === 'FAIL' || type === 'EXIT') {
      try {
        message = new TextDecoder().decode(decodeBuffer(message))
      } catch {
        message = `decode [${message}] error`
      }
    } else if (type !== null) {
      message = `[TrzszError] ${type}: ${message}`
    }

    super(message)
    Object.setPrototypeOf(this, TrzszError.prototype)
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, TrzszError)
    }

    this.name = 'TrzszError'
    this.type = type
    this.trace = trace
  }

  /**
   * Check if the error should include traceback.
   * @return {boolean} True if traceback should be included.
   */
  public isTraceBack (): boolean {
    if (this.type === 'fail' || this.type === 'EXIT') {
      return false
    }
    return this.trace
  }

  /**
   * Check if the error is a remote exit.
   * @return {boolean} True if remote exit.
   */
  public isRemoteExit (): boolean {
    return this.type === 'EXIT'
  }

  /**
   * Check if the error is a remote failure.
   * @return {boolean} True if remote failure.
   */
  public isRemoteFail (): boolean {
    return this.type === 'fail' || this.type === 'FAIL'
  }

  /**
   * Check if the error indicates stop and delete.
   * @return {boolean} True if stop and delete.
   */
  public isStopAndDelete (): boolean {
    if (this.type !== 'fail') {
      return false
    }
    return this.message === 'Stopped and deleted'
  }

  /**
   * Get the error message.
   * @param {Error} err - The error object.
   * @return {string} The error message.
   */
  public static getErrorMessage (err: Error): string {
    if (err instanceof TrzszError && !err.isTraceBack()) {
      return err.message
    }
    if (typeof err.stack === 'string' && err.stack.length > 0) {
      return err.stack.replace('TrzszError: ', '')
    }
    return err.toString()
  }
}

/**
 * Interface for trzsz file operations.
 */
export interface TrzszFile {
  closeFile: () => void
}

/**
 * Interface for trzsz file reader.
 */
export interface TrzszFileReader extends TrzszFile {
  getPathId: () => number
  getRelPath: () => string[]
  isDir: () => boolean
  getSize: () => number
  readFile: (buf: ArrayBuffer) => Promise<Uint8Array>
}

/**
 * Interface for trzsz file writer.
 */
export interface TrzszFileWriter extends TrzszFile {
  getFileName: () => string
  getLocalName: () => string
  isDir: () => boolean
  writeFile: (buf: Uint8Array) => Promise<void>
  deleteFile: () => Promise<string>
}

/**
 * Type for opening save file.
 */
export type OpenSaveFile = (
  saveParam: any,
  fileName: string,
  directory: boolean,
  overwrite: boolean,
) => Promise<TrzszFileWriter>

/**
 * Interface for progress callback.
 */
export interface ProgressCallback {
  onNum: (num: number) => void
  onName: (name: string) => void
  onSize: (size: number) => void
  onStep: (step: number) => void
  onDone: () => void
}

/**
 * Check for duplicate file names.
 * @param {TrzszFileReader[]} files - The files to check.
 */
export function checkDuplicateNames (files: TrzszFileReader[]): void {
  const names = new Set<string>()
  for (const file of files) {
    const path = file.getRelPath().join('/')
    if (names.has(path)) {
      throw new TrzszError(`Duplicate name: ${path}`)
    }
    names.add(path)
  }
}

/**
 * Check if an array contains only elements of a specific type.
 * @param {any} arr - The array to check.
 * @param {string} type - The type to check for.
 * @return {boolean} True if all elements are of the specified type.
 */
export function isArrayOfType (arr: any, type: string): boolean {
  if (!Array.isArray(arr)) {
    return false
  }
  for (const a of arr) {
    switch (type) {
      case 'string':
        if (typeof a !== 'string') return false
        break
      case 'number':
        if (typeof a !== 'number') return false
        break
      case 'boolean':
        if (typeof a !== 'boolean') return false
        break
      case 'object':
        if (typeof a !== 'object') return false
        break
      case 'function':
        if (typeof a !== 'function') return false
        break
      case 'undefined':
        if (typeof a !== 'undefined') return false
        break
      default:
        return false
    }
  }
  return true
}

/**
 * Check if a character is a VT100 end character.
 * @param {number} c - The character code.
 * @return {boolean} True if it's a VT100 end character.
 */
export function isVT100End (c: number): boolean {
  if (c >= 0x61 && c <= 0x7a) {
    // 'a' <= c && c <= 'z'
    return true
  }
  if (c >= 0x41 && c <= 0x5a) {
    // 'A' <= c && c <= 'Z'
    return true
  }
  return false
}

/**
 * Strip VT100 escape sequences from server output.
 * @param {string | ArrayBuffer | Uint8Array | Blob} output - The server output.
 * @return {string | ArrayBuffer | Uint8Array | Blob} The stripped output.
 */
export function stripServerOutput (output: string | ArrayBuffer | Uint8Array | Blob): string | ArrayBuffer | Uint8Array | Blob {
  let uint8: Uint8Array
  if (typeof output === 'string') {
    uint8 = strToUint8(output)
  } else if (output instanceof ArrayBuffer) {
    uint8 = new Uint8Array(output)
  } else if (output instanceof Uint8Array) {
    uint8 = output
  } else {
    return output
  }
  const buf = new Uint8Array(uint8.length)
  let skipVT100 = false
  let idx = 0
  for (let i = 0; i < uint8.length; i++) {
    const c = uint8[i]
    if (skipVT100) {
      if (isVT100End(c)) {
        skipVT100 = false
      }
    } else if (c === 0x1b) {
      skipVT100 = true
    } else {
      buf[idx++] = c
    }
  }
  while (idx > 0) {
    const c = buf[idx - 1]
    if (c !== 0x0d && c !== 0x0a) {
      // not \r\n
      break
    }
    idx--
  }
  const result = buf.subarray(0, idx)
  if (result.length > 100) {
    return output
  }
  return String.fromCharCode.apply(null, Array.from(result))
}

/**
 * Tmux mode constants.
 */
export const TmuxMode = {
  NoTmux: 0,
  TmuxNormalMode: 1,
  TmuxControlMode: 2
} as const

export type TmuxModeType = (typeof TmuxMode)[keyof typeof TmuxMode]

/**
 * Format saved files message.
 * @param {string[]} fileNames - The file names.
 * @param {string} destPath - The destination path.
 * @return {string} The formatted message.
 */
export function formatSavedFiles (fileNames: string[], destPath: string): string {
  let msg = `Saved ${fileNames.length} ${fileNames.length > 1 ? 'files/directories' : 'file/directory'}`
  if (destPath.length > 0) {
    msg += ` to ${destPath}`
  }
  return [msg].concat(fileNames).join('\r\n- ')
}

/**
 * Strip tmux status line from buffer.
 * @param {string} buf - The input buffer.
 * @return {string} The stripped buffer.
 */
export function stripTmuxStatusLine (buf: string): string {
  while (true) {
    const beginIdx = buf.indexOf('\x1bP=')
    if (beginIdx < 0) {
      return buf
    }
    let bufIdx = beginIdx + 3
    const midIdx = buf.substring(bufIdx).indexOf('\x1bP=')
    if (midIdx < 0) {
      return buf.substring(0, beginIdx)
    }
    bufIdx += midIdx + 3
    const endIdx = buf.substring(bufIdx).indexOf('\x1b\\')
    if (endIdx < 0) {
      return buf.substring(0, beginIdx)
    }
    bufIdx += endIdx + 2
    buf = buf.substring(0, beginIdx) + buf.substring(bufIdx)
  }
}
