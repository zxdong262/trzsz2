import { Terminal, IDisposable } from '@xterm/xterm'
import {
  TrzszTransfer,
  TrzszError,
  type TrzszFileReader,
  type TrzszFileWriter,
  type ProgressCallback
} from 'trzsz2'

/**
 * File reader implementation for browser File objects
 */
class BrowserFileReader implements TrzszFileReader {
  private readonly file: File
  private readonly relPath: string[]
  private readonly pathId: number
  private offset: number = 0
  private closed: boolean = false

  constructor (file: File, pathId: number = 0, relPath: string[] = [file.name]) {
    this.file = file
    this.pathId = pathId
    this.relPath = relPath
  }

  getPathId (): number {
    return this.pathId
  }

  getRelPath (): string[] {
    return this.relPath
  }

  isDir (): boolean {
    return false
  }

  getSize (): number {
    return this.file.size
  }

  async readFile (buf: ArrayBuffer): Promise<Uint8Array> {
    if (this.closed) {
      return new Uint8Array(0)
    }

    const remaining = this.file.size - this.offset
    if (remaining <= 0) {
      return new Uint8Array(0)
    }

    const readSize = Math.min(remaining, buf.byteLength)
    const slice = this.file.slice(this.offset, this.offset + readSize)
    const arrayBuffer = await slice.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    this.offset += data.length

    return data
  }

  closeFile (): void {
    this.closed = true
  }
}

/**
 * File writer implementation for browser downloads
 */
class BrowserFileWriter implements TrzszFileWriter {
  private readonly fileName: string
  private readonly localName: string
  private chunks: Uint8Array[] = []
  private closed: boolean = false

  constructor (fileName: string) {
    this.fileName = fileName
    this.localName = fileName
  }

  getFileName (): string {
    return this.fileName
  }

  getLocalName (): string {
    return this.localName
  }

  isDir (): boolean {
    return false
  }

  async writeFile (buf: Uint8Array): Promise<void> {
    if (this.closed) return
    this.chunks.push(new Uint8Array(buf))
  }

  async deleteFile (): Promise<string> {
    this.chunks = []
    this.closed = true
    return this.localName
  }

  closeFile (): void {
    if (this.closed) return
    this.closed = true

    // Save the file using blob download
    try {
      // Convert Uint8Array chunks to ArrayBuffer for Blob compatibility
      const blobParts: ArrayBuffer[] = this.chunks.map(chunk => {
        const buffer = new ArrayBuffer(chunk.length)
        new Uint8Array(buffer).set(chunk)
        return buffer
      })
      const blob = new Blob(blobParts, { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = this.fileName
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Failed to save file:', e)
    }
  }
}

/**
 * Open save file implementation for browser
 */
const openSaveFile = async (
  _saveParam: any,
  fileName: string,
  _directory: boolean,
  _overwrite: boolean
): Promise<TrzszFileWriter> => {
  return new BrowserFileWriter(fileName)
}

/**
 * Progress callback implementation
 */
class TerminalProgress implements ProgressCallback {
  private readonly term: Terminal
  private fileName: string = ''
  private fileSize: number = 0
  private fileNum: number = 0
  private currentStep: number = 0
  private startTime: number = 0
  private lastStep: number = 0
  private lastTime: number = 0

  constructor (term: Terminal) {
    this.term = term
  }

  onNum (num: number): void {
    this.fileNum = num
    this.term.writeln(`\r\nReceiving ${num} file(s)...`)
  }

  onName (name: string): void {
    this.fileName = name
    this.term.writeln(`\r\nFile: ${name}`)
    this.startTime = Date.now()
    this.lastStep = 0
    this.lastTime = this.startTime
  }

  onSize (size: number): void {
    this.fileSize = size
    this.currentStep = 0
    const sizeStr = this.formatSize(size)
    this.term.writeln(`Size: ${sizeStr}`)
  }

  onStep (step: number): void {
    this.currentStep = step
    const percent = this.fileSize > 0 ? Math.round((step / this.fileSize) * 100) : 0

    // Calculate speed
    const now = Date.now()
    const timeDiff = now - this.lastTime
    const stepDiff = step - this.lastStep
    let speedStr = ''

    if (timeDiff > 500 && stepDiff > 0) {
      const speed = (stepDiff / timeDiff) * 1000 // bytes per second
      speedStr = ` ${this.formatSize(speed)}/s`
      this.lastStep = step
      this.lastTime = now
    }

    const doneStr = this.formatSize(step)
    const totalStr = this.formatSize(this.fileSize)
    this.term.write(`\rProgress: ${percent}% (${doneStr}/${totalStr})${speedStr}`)
  }

  onDone (): void {
    this.term.writeln(`\r\nFile "${this.fileName}" saved successfully.`)
  }

  private formatSize (bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
}

export default class AddonTrzsz {
  private _disposables: IDisposable[] = []
  private socket: WebSocket | null = null
  private term: Terminal | null = null
  private transfer: TrzszTransfer | null = null
  private onDetect: ((type: 'receive' | 'send') => void) | null = null
  private onLog: ((message: string) => void) | null = null
  private isTransferring: boolean = false
  private pendingFiles: File[] = []
  private pendingTransferData: string = ''

  // Debug mode
  readonly DEBUG = true

  constructor () {
    this.log('Trzsz addon initialized')
  }

  private log (...args: any[]): void {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
    console.log('[Trzsz]', message)
    if (this.onLog) {
      this.onLog(message)
    }
  }

  private debug (...args: any[]): void {
    if (this.DEBUG) {
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
      console.log('[Trzsz Debug]', message)
      if (this.onLog) {
        this.onLog('[Debug] ' + message)
      }
    }
  }

  private error (...args: any[]): void {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
    console.error('[Trzsz Error]', message)
    if (this.onLog) {
      this.onLog('[Error] ' + message)
    }
  }

  activate (terminal: Terminal): void {
    this.term = terminal
  }

  setOnLog (callback: (message: string) => void): void {
    this.onLog = callback
  }

  dispose (): void {
    this.transfer?.cleanup()
    this.transfer = null
    this._disposables.forEach(d => d.dispose())
    this._disposables = []
  }

  /**
   * Attach trzsz to WebSocket and terminal
   */
  trzszAttach (ctx: { socket: WebSocket, term: Terminal, onDetect?: (type: 'receive' | 'send') => void }): void {
    this.socket = ctx.socket
    this.term = ctx.term
    this.socket.binaryType = 'arraybuffer'
    if (ctx.onDetect != null) this.onDetect = ctx.onDetect
    this.log('trzszAttach called')
  }

  /**
   * Consume incoming data from WebSocket
   */
  consume (data: ArrayBuffer | string): void {
    this.debug('consume called, type:', typeof data, 'isArrayBuffer:', data instanceof ArrayBuffer)
    if (typeof data === 'string') {
      this.handleTextData(data)
    } else {
      this.handleBinaryData(new Uint8Array(data))
    }
  }

  /**
   * Handle text data - detect trzsz protocol
   */
  private handleTextData (data: string): void {
    this.debug('handleTextData called, length:', data.length, 'preview:', data.substring(0, 100))

    // Check for trzsz protocol detection
    // trzsz sends "#ACT:" or similar protocol markers
    if (this.isTransferring && this.transfer) {
      // During transfer, feed data to transfer handler
      this.transfer.addReceivedData(data)
      return
    }

    // Detect trzsz transfer header: ::TRZSZ:TRANSFER:
    // R = server ready to receive (upload with trz)
    // S = server ready to send (download with tsz)
    const trzszIndex = data.indexOf('::TRZSZ:TRANSFER:')
    if (trzszIndex !== -1) {
      const afterHeader = data.substring(trzszIndex + 17)
      const direction = afterHeader.charAt(0)
      this.log('Detected ::TRZSZ:TRANSFER: direction:', direction)

      if (direction === 'R') {
        // Server is ready to receive files (upload with trz)
        this.log('Server ready to receive - triggering file selection')
        this.log('onDetect callback exists:', !(this.onDetect == null))
        this.pendingTransferData = data
        if (this.onDetect != null) {
          this.onDetect('send')
        } else {
          this.error('onDetect callback is not set!')
        }
        return
      } else if (direction === 'S') {
        // Server is ready to send files (download with tsz)
        this.log('Server ready to send - starting download')
        this.startReceiveTransfer(data)
        return
      }
    }

    // Also check for #ACT: (protocol messages)
    if (data.includes('#ACT:')) {
      this.log('Trzsz protocol detected (receive mode)')
      this.startReceiveTransfer(data)
      return
    }

    if (data.includes('#CFG:')) {
      this.log('Trzsz protocol detected (send mode)')
      this.pendingTransferData = data
      if (this.onDetect != null) {
        this.onDetect('send')
      }
      return
    }

    // Normal terminal output
    this.term?.write(data)
  }

  /**
   * Handle binary data
   */
  private handleBinaryData (data: Uint8Array): void {
    if (this.isTransferring && this.transfer) {
      this.transfer.addReceivedData(data)
      return
    }

    // Check if this might be trzsz binary data
    const str = new TextDecoder().decode(data)

    // Check for trzsz transfer header
    if (str.includes('::TRZSZ:TRANSFER:')) {
      this.handleTextData(str)
      return
    }

    if (str.includes('#ACT:') || str.includes('#CFG:')) {
      this.handleTextData(str)
      return
    }

    // Normal binary output
    this.term?.write(data)
  }

  /**
   * Start receive transfer (download from server)
   */
  private async startReceiveTransfer (initialData: string): Promise<void> {
    if ((this.term == null) || (this.socket == null)) return

    this.isTransferring = true
    this.transfer = new TrzszTransfer((data) => {
      this.socket?.send(data)
    })

    try {
      // Add the initial data that triggered the transfer
      this.transfer.addReceivedData(initialData)

      // Send action with confirm=true (we want to download files)
      this.log('Sending action to server...')
      await this.transfer.sendAction(true, false)

      // Wait for server's config
      this.log('Waiting for config from server...')
      const config = await this.transfer.recvConfig()
      this.log('Received config:', config)

      const progress = new TerminalProgress(this.term)
      const localNames = await this.transfer.recvFiles(null, openSaveFile, progress)

      this.log('Files received:', localNames)
      await this.transfer.clientExit('Success')

      this.term.writeln('\r\nTransfer complete.')
    } catch (e) {
      this.error('Receive transfer error:', e)
      if (this.transfer) {
        await this.transfer.clientError(e as Error)
      }
      this.term?.writeln(`\r\nTransfer error: ${(e as Error).message}`)
    } finally {
      this.isTransferring = false
      this.transfer?.cleanup()
      this.transfer = null
    }
  }

  /**
   * Send files to server (upload)
   */
  async sendFiles (files: File[]): Promise<void> {
    if ((this.term == null) || (this.socket == null)) {
      this.log('Cannot send files: terminal or socket not ready')
      return
    }

    if (this.isTransferring) {
      this.log('Already transferring')
      return
    }

    this.pendingFiles = files
    this.isTransferring = true

    this.transfer = new TrzszTransfer((data) => {
      this.socket?.send(data)
    })

    try {
      this.term.writeln(`\r\nSending ${files.length} file(s)...`)

      // Add any pending data that was received before file selection
      if (this.pendingTransferData) {
        this.transfer.addReceivedData(this.pendingTransferData)
        this.pendingTransferData = ''
      }

      // Send action with confirm=true (we want to upload files)
      this.log('Sending action to server...')
      await this.transfer.sendAction(true, false)

      // Create file readers
      const fileReaders: TrzszFileReader[] = files.map((file, idx) => {
        return new BrowserFileReader(file, idx, [file.name])
      })

      // Wait for server's config
      this.log('Waiting for config from server...')
      const config = await this.transfer.recvConfig()
      this.log('Received config:', config)

      // Progress callback
      let sendStartTime = Date.now()
      let sendLastStep = 0
      let sendLastTime = sendStartTime
      const progress = {
        onNum: (num: number) => {
          this.term?.writeln(`\r\nSending ${num} file(s)...`)
        },
        onName: (name: string) => {
          this.term?.writeln(`\r\nFile: ${name}`)
          sendStartTime = Date.now()
          sendLastStep = 0
          sendLastTime = sendStartTime
        },
        onSize: (size: number) => {
          const sizeStr = this.formatSize(size)
          this.term?.writeln(`Size: ${sizeStr}`)
        },
        onStep: (step: number) => {
          const totalSize = files.reduce((sum, f) => sum + f.size, 0)
          const percent = totalSize > 0 ? Math.round((step / totalSize) * 100) : 0

          // Calculate speed
          const now = Date.now()
          const timeDiff = now - sendLastTime
          const stepDiff = step - sendLastStep
          let speedStr = ''

          if (timeDiff > 500 && stepDiff > 0) {
            const speed = (stepDiff / timeDiff) * 1000 // bytes per second
            speedStr = ` ${this.formatSize(speed)}/s`
            sendLastStep = step
            sendLastTime = now
          }

          const doneStr = this.formatSize(step)
          const totalStr = this.formatSize(totalSize)
          this.term?.write(`\rProgress: ${percent}% (${doneStr}/${totalStr})${speedStr}`)
        },
        onDone: () => {
          this.term?.writeln('\r\nFile sent.')
        }
      }

      const remoteNames = await this.transfer.sendFiles(fileReaders, progress)
      this.log('Files sent:', remoteNames)

      // Send EXIT to signal completion
      await this.transfer.clientExit('Success')

      this.term.writeln('\r\nUpload complete.')
    } catch (e) {
      this.error('Send transfer error:', e)
      if (this.transfer) {
        await this.transfer.clientError(e as Error)
      }
      this.term?.writeln(`\r\nUpload error: ${(e as Error).message}`)
    } finally {
      this.isTransferring = false
      this.transfer?.cleanup()
      this.transfer = null
      this.pendingFiles = []
    }
  }

  /**
   * Format file size
   */
  private formatSize (bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
}
