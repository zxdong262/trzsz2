/**
 * trzsz2: https://github.com/zxdong262/trzsz2
 * Copyright(c) 2024 Lonny Wong
 * @license MIT
 *
 * Pure protocol implementation without fs/browser dependencies.
 */

import { Md5 } from 'ts-md5'
import { TrzszBuffer } from './buffer'
import { escapeCharsToCodes, escapeData, unescapeData } from './escape'
import {
  trzszVersion,
  uint8ToStr,
  encodeBuffer,
  decodeBuffer,
  TmuxMode,
  TrzszError,
  type TrzszFile,
  type OpenSaveFile,
  type TrzszFileReader,
  type TrzszFileWriter,
  type ProgressCallback,
  stripTmuxStatusLine
} from './comm'

/**
 * TrzszTransfer class for handling file transfer protocol.
 */
export class TrzszTransfer {
  private readonly buffer: TrzszBuffer = new TrzszBuffer()
  private readonly writer: (data: string | Uint8Array) => void
  private readonly isWindowsShell: boolean
  private remoteIsWindows: boolean = false
  private lastInputTime: number = 0
  private readonly openedFiles: TrzszFile[] = []
  private readonly createdFiles: TrzszFileWriter[] = []
  private tmuxOutputJunk: boolean = false
  private cleanTimeoutInMilliseconds: number = 100
  private transferConfig: Record<string, unknown> = {}
  private stopped: boolean = false
  private maxChunkTimeInMilliseconds: number = 0
  private protocolNewline: string = '\n'

  /**
   * Create a TrzszTransfer.
   * @param writer - The output writer function.
   * @param isWindowsShell - Whether the shell is Windows.
   */
  public constructor (writer: (data: string | Uint8Array) => void, isWindowsShell: boolean = false) {
    this.writer = writer
    this.isWindowsShell = isWindowsShell
  }

  /**
   * Cleanup resources.
   */
  public cleanup (): void {
    for (const file of this.openedFiles) {
      file.closeFile()
    }
  }

  /**
   * Add received data to the buffer.
   * @param data - The received data.
   */
  public addReceivedData (data: string | ArrayBuffer | Uint8Array | Blob): void {
    if (!this.stopped) {
      this.buffer.addBuffer(data)
    }
    this.lastInputTime = Date.now()
  }

  /**
   * Stop transferring.
   */
  public async stopTransferring (): Promise<void> {
    this.cleanTimeoutInMilliseconds = Math.max(this.maxChunkTimeInMilliseconds * 2, 500)
    this.stopped = true
    this.buffer.stopBuffer()
  }

  /**
   * Clean input buffer.
   * @param timeoutInMilliseconds - The timeout in milliseconds.
   */
  private async cleanInput (timeoutInMilliseconds: number): Promise<void> {
    this.stopped = true
    this.buffer.drainBuffer()
    this.lastInputTime = Date.now()
    while (true) {
      const sleepTime = timeoutInMilliseconds - (Date.now() - this.lastInputTime)
      if (sleepTime <= 0) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, sleepTime))
    }
  }

  /**
   * Send a line.
   * @param typ - The type.
   * @param buf - The buffer.
   */
  private async sendLine (typ: string, buf: string): Promise<void> {
    this.writer(`#${typ}:${buf}${this.protocolNewline}`)
  }

  /**
   * Receive a line.
   * @param expectType - The expected type.
   * @param mayHasJunk - Whether there may be junk.
   */
  private async recvLine (expectType: string, mayHasJunk: boolean = false): Promise<string> {
    if (this.stopped) {
      throw new TrzszError('Stopped')
    }

    if (this.isWindowsShell || this.remoteIsWindows) {
      let line = await this.buffer.readLineOnWindows()
      const idx = line.lastIndexOf('#' + expectType + ':')
      if (idx >= 0) {
        line = line.substring(idx)
      } else {
        const idx = line.lastIndexOf('#')
        if (idx > 0) {
          line = line.substring(idx)
        }
      }
      return line
    }

    let line = await this.buffer.readLine()

    if (this.tmuxOutputJunk || mayHasJunk) {
      if (line.length > 0) {
        while (line[line.length - 1] === '\r') {
          line = line.substring(0, line.length - 1) + (await this.buffer.readLine())
        }
      }
      const idx = line.lastIndexOf('#' + expectType + ':')
      if (idx >= 0) {
        line = line.substring(idx)
      } else {
        const idx = line.lastIndexOf('#')
        if (idx > 0) {
          line = line.substring(idx)
        }
      }
      line = stripTmuxStatusLine(line)
    }

    return line
  }

  /**
   * Receive and check a line.
   * @param expectType - The expected type.
   * @param mayHasJunk - Whether there may be junk.
   */
  private async recvCheck (expectType: string, mayHasJunk: boolean = false): Promise<string> {
    const line = await this.recvLine(expectType, mayHasJunk)
    const idx = line.indexOf(':')
    if (idx < 1) {
      throw new TrzszError(encodeBuffer(line), 'colon', true)
    }
    const typ = line.substring(1, idx)
    const buf = line.substring(idx + 1)
    if (typ !== expectType) {
      throw new TrzszError(buf, typ, true)
    }
    return buf
  }

  /**
   * Send an integer.
   * @param typ - The type.
   * @param val - The value.
   */
  private async sendInteger (typ: string, val: number): Promise<void> {
    await this.sendLine(typ, val.toString())
  }

  /**
   * Receive an integer.
   * @param typ - The type.
   * @param mayHasJunk - Whether there may be junk.
   */
  private async recvInteger (typ: string, mayHasJunk: boolean = false): Promise<number> {
    const buf = await this.recvCheck(typ, mayHasJunk)
    return Number(buf)
  }

  /**
   * Check an integer.
   * @param expect - The expected value.
   */
  private async checkInteger (expect: number): Promise<void> {
    const result = await this.recvInteger('SUCC')
    if (result !== expect) {
      throw new TrzszError(`Integer check [${result}] <> [${expect}]`, null, true)
    }
  }

  /**
   * Send a string.
   * @param typ - The type.
   * @param str - The string.
   */
  private async sendString (typ: string, str: string): Promise<void> {
    await this.sendLine(typ, encodeBuffer(str))
  }

  /**
   * Receive a string.
   * @param typ - The type.
   * @param mayHasJunk - Whether there may be junk.
   */
  private async recvString (typ: string, mayHasJunk: boolean = false): Promise<string> {
    const buf = await this.recvCheck(typ, mayHasJunk)
    return await uint8ToStr(decodeBuffer(buf), 'utf8')
  }

  /**
   * Check a string.
   * @param expect - The expected string.
   */
  protected async checkString (expect: string): Promise<void> {
    const result = await this.recvString('SUCC')
    if (result !== expect) {
      throw new TrzszError(`String check [${result}] <> [${expect}]`, null, true)
    }
  }

  /**
   * Send binary data.
   * @param typ - The type.
   * @param buf - The buffer.
   */
  private async sendBinary (typ: string, buf: Uint8Array): Promise<void> {
    await this.sendLine(typ, encodeBuffer(buf))
  }

  /**
   * Receive binary data.
   * @param typ - The type.
   * @param mayHasJunk - Whether there may be junk.
   */
  private async recvBinary (typ: string, mayHasJunk: boolean = false): Promise<Uint8Array> {
    const buf = await this.recvCheck(typ, mayHasJunk)
    return decodeBuffer(buf)
  }

  /**
   * Check binary data.
   * @param expect - The expected buffer.
   */
  private async checkBinary (expect: Uint8Array): Promise<void> {
    const result = await this.recvBinary('SUCC')
    if (result.length !== expect.length) {
      throw new TrzszError(
        `Binary length check [${result.length}] <> [${expect.length}]`,
        null,
        true
      )
    }
    for (let i = 0; i < result.length; i++) {
      if (result[i] !== expect[i]) {
        throw new TrzszError(`Binary check [${result[i]}] <> [${expect[i]}]`, null, true)
      }
    }
  }

  /**
   * Send data.
   * @param data - The data.
   * @param binary - Whether to use binary mode.
   * @param escapeCodes - The escape codes.
   */
  private async sendData (
    data: Uint8Array,
    binary: boolean,
    escapeCodes: number[][]
  ): Promise<void> {
    if (!binary) {
      await this.sendBinary('DATA', data)
      return
    }

    const buf = escapeData(data, escapeCodes)
    this.writer(`#DATA:${buf.length}\n`)
    this.writer(buf)
  }

  /**
   * Receive data.
   * @param binary - Whether to use binary mode.
   * @param escapeCodes - The escape codes.
   * @param timeoutInMilliseconds - The timeout in milliseconds.
   */
  private async recvData (
    binary: boolean,
    escapeCodes: number[][],
    timeoutInMilliseconds: number
  ): Promise<Uint8Array> {
    return await Promise.race<Uint8Array>([
      new Promise<Uint8Array>((_resolve, reject) =>
        setTimeout(() => {
          this.cleanTimeoutInMilliseconds = 3000
          reject(new TrzszError('Receive data timeout'))
        }, timeoutInMilliseconds)
      ),
      (async () => {
        if (!binary) {
          return await this.recvBinary('DATA')
        }
        const size = await this.recvInteger('DATA')
        const data = await this.buffer.readBinary(size)
        return unescapeData(data, escapeCodes)
      })()
    ])
  }

  /**
   * Send action.
   * @param confirm - Whether to confirm.
   * @param remoteIsWindows - Whether the remote is Windows.
   */
  public async sendAction (confirm: boolean, remoteIsWindows: boolean): Promise<void> {
    const action: Record<string, unknown> = {
      lang: 'js',
      confirm,
      version: trzszVersion,
      support_dir: true
    }
    if (this.isWindowsShell || remoteIsWindows) {
      action.binary = false
      action.newline = '!\n'
    }
    if (remoteIsWindows) {
      this.remoteIsWindows = true
      this.protocolNewline = '!\n'
    }
    await this.sendString('ACT', JSON.stringify(action))
  }

  /**
   * Receive action.
   */
  public async recvAction (): Promise<Record<string, unknown>> {
    const buf = await this.recvString('ACT', true)
    const action = JSON.parse(buf)
    const newline = (action as Record<string, unknown>).newline as string | undefined
    if (typeof newline === 'string' && newline.length > 0) {
      this.protocolNewline = newline
    }
    return action
  }

  /**
   * Send config.
   * @param args - The config arguments.
   * @param escapeChars - The escape characters.
   * @param tmuxMode - The tmux mode.
   * @param tmuxPaneWidth - The tmux pane width.
   */
  public async sendConfig (
    args: Record<string, unknown>,
    escapeChars: string[][],
    tmuxMode: number,
    tmuxPaneWidth: number
  ): Promise<void> {
    const config: Record<string, unknown> = { lang: 'js' }
    if ((args).quiet === true) {
      config.quiet = true
    }
    if ((args).binary === true) {
      config.binary = true
      config.escape_chars = escapeChars
    }
    if ((args).directory === true) {
      config.directory = true
    }
    if (typeof (args).bufsize === 'number') {
      config.bufsize = (args).bufsize
    }
    if (typeof (args).timeout === 'number') {
      config.timeout = (args).timeout
    }
    if ((args).overwrite === true) {
      config.overwrite = true
    }
    if (tmuxMode === TmuxMode.TmuxNormalMode) {
      config.tmux_output_junk = true
    }
    if (tmuxPaneWidth > 0) {
      config.tmux_pane_width = tmuxPaneWidth
    }
    let jsonStr = JSON.stringify(config)
    jsonStr = jsonStr.replace(/[\u007F-\uFFFF]/g, function (chr) {
      return '\\u' + ('0000' + chr.charCodeAt(0).toString(16)).slice(-4)
    })
    this.transferConfig = config
    await this.sendString('CFG', jsonStr)
  }

  /**
   * Receive config.
   */
  public async recvConfig (): Promise<Record<string, unknown>> {
    const buf = await this.recvString('CFG', true)
    this.transferConfig = JSON.parse(buf)
    this.tmuxOutputJunk = this.transferConfig.tmux_output_junk === true
    return this.transferConfig
  }

  /**
   * Send client exit.
   * @param msg - The message.
   */
  public async clientExit (msg: string): Promise<void> {
    await this.sendString('EXIT', msg)
  }

  /**
   * Receive exit.
   */
  public async recvExit (): Promise<string> {
    return await this.recvString('EXIT')
  }

  /**
   * Delete created files.
   */
  private async deleteCreatedFiles (): Promise<string[]> {
    const deletedFiles: string[] = []
    for (const file of this.createdFiles) {
      const path = await file.deleteFile()
      if (typeof path === 'string' && path.length > 0) {
        deletedFiles.push(path)
      }
    }
    return deletedFiles
  }

  /**
   * Handle client error.
   * @param err - The error.
   */
  public async clientError (err: Error): Promise<void> {
    await this.cleanInput(this.cleanTimeoutInMilliseconds)

    const errMsg = TrzszError.getErrorMessage(err)
    let trace = true
    if (err instanceof TrzszError) {
      trace = err.isTraceBack()
      if (err.isRemoteExit()) {
        return
      }
      if (err.isRemoteFail()) {
        if (trace) {
          console.log(errMsg)
        }
        return
      }
    }

    await this.sendString(trace ? 'FAIL' : 'fail', errMsg)
    if (trace) {
      console.log(errMsg)
    }
  }

  /**
   * Handle server error.
   * @param err - The error.
   */
  public async serverError (err: Error): Promise<void> {
    await this.cleanInput(this.cleanTimeoutInMilliseconds)

    const errMsg = TrzszError.getErrorMessage(err)
    let trace = true
    if (err instanceof TrzszError) {
      if (err.isStopAndDelete()) {
        const deletedFiles = await this.deleteCreatedFiles()
        if (deletedFiles.length > 0) {
          await this.serverExit([err.message + ':'].concat(deletedFiles).join('\r\n- '))
          return
        }
      }
      trace = err.isTraceBack()
      if (err.isRemoteExit() || err.isRemoteFail()) {
        await this.serverExit(errMsg)
        return
      }
    }

    await this.sendString(trace ? 'FAIL' : 'fail', errMsg)
    await this.serverExit(errMsg)
  }

  /**
   * Server exit - to be implemented by subclass or user.
   * @param msg - The message.
   */
  public async serverExit (_msg: string): Promise<void> {
    // Base implementation does nothing
    // Subclasses or users should override this
  }

  /**
   * Send file number.
   * @param num - The number of files.
   * @param progressCallback - The progress callback.
   */
  private async sendFileNum (num: number, progressCallback: ProgressCallback | null): Promise<void> {
    await this.sendInteger('NUM', num)
    await this.checkInteger(num)
    if (progressCallback != null) {
      progressCallback.onNum(num)
    }
  }

  /**
   * Send file name.
   * @param file - The file reader.
   * @param directory - Whether it's a directory.
   * @param progressCallback - The progress callback.
   */
  private async sendFileName (
    file: TrzszFileReader,
    directory: boolean,
    progressCallback: ProgressCallback | null
  ): Promise<string> {
    const relPath = file.getRelPath()
    const fileName = relPath[relPath.length - 1]
    if (directory) {
      const jsonName = {
        path_id: file.getPathId(),
        path_name: relPath,
        is_dir: file.isDir()
      }
      await this.sendString('NAME', JSON.stringify(jsonName))
    } else {
      await this.sendString('NAME', fileName)
    }
    const remoteName = await this.recvString('SUCC')
    if (progressCallback != null) {
      progressCallback.onName(fileName)
    }
    return remoteName
  }

  /**
   * Send file size.
   * @param size - The file size.
   * @param progressCallback - The progress callback.
   */
  private async sendFileSize (
    size: number,
    progressCallback: ProgressCallback | null
  ): Promise<void> {
    await this.sendInteger('SIZE', size)
    await this.checkInteger(size)
    if (progressCallback != null) {
      progressCallback.onSize(size)
    }
  }

  /**
   * Send file data.
   * @param file - The file reader.
   * @param size - The file size.
   * @param binary - Whether to use binary mode.
   * @param escapeCodes - The escape codes.
   * @param maxBufSize - The maximum buffer size.
   * @param progressCallback - The progress callback.
   */
  private async sendFileData (
    file: TrzszFileReader,
    size: number,
    binary: boolean,
    escapeCodes: number[][],
    maxBufSize: number,
    progressCallback: ProgressCallback | null
  ): Promise<Uint8Array> {
    let step = 0
    if (progressCallback != null) {
      progressCallback.onStep(step)
    }
    let bufSize = 1024
    let buffer = new ArrayBuffer(bufSize)
    const md5 = new Md5()
    while (step < size) {
      const beginTime = Date.now()
      const data = await file.readFile(buffer)
      await this.sendData(data, binary, escapeCodes)
      md5.appendByteArray(data)
      await this.checkInteger(data.length)
      step += data.length
      if (progressCallback != null) {
        progressCallback.onStep(step)
      }
      const chunkTime = Date.now() - beginTime
      if (data.length === bufSize && chunkTime < 500 && bufSize < maxBufSize) {
        bufSize = Math.min(bufSize * 2, maxBufSize)
        buffer = new ArrayBuffer(bufSize)
      } else if (chunkTime >= 2000 && bufSize > 1024) {
        bufSize = 1024
        buffer = new ArrayBuffer(bufSize)
      }
      if (chunkTime > this.maxChunkTimeInMilliseconds) {
        this.maxChunkTimeInMilliseconds = chunkTime
      }
    }
    return new Uint8Array((md5.end(true) as Int32Array).buffer)
  }

  /**
   * Send file MD5.
   * @param digest - The MD5 digest.
   * @param progressCallback - The progress callback.
   */
  private async sendFileMD5 (
    digest: Uint8Array,
    progressCallback: ProgressCallback | null
  ): Promise<void> {
    await this.sendBinary('MD5', digest)
    await this.checkBinary(digest)
    if (progressCallback != null) {
      progressCallback.onDone()
    }
  }

  /**
   * Send files.
   * @param files - The file readers.
   * @param progressCallback - The progress callback.
   */
  public async sendFiles (
    files: TrzszFileReader[],
    progressCallback: ProgressCallback | null
  ): Promise<string[]> {
    this.openedFiles.push(...files)

    const binary = this.transferConfig.binary === true
    const directory = this.transferConfig.directory === true
    const bufsizeVal = this.transferConfig.bufsize as number | undefined
    const maxBufSize = typeof bufsizeVal === 'number' ? bufsizeVal : 10 * 1024 * 1024
    const escapeCodes = Array.isArray(this.transferConfig.escape_chars)
      ? escapeCharsToCodes(this.transferConfig.escape_chars as string[][])
      : []

    await this.sendFileNum(files.length, progressCallback)

    const remoteNames: string[] = []
    for (const file of files) {
      const remoteName = await this.sendFileName(file, directory, progressCallback)

      if (!remoteNames.includes(remoteName)) {
        remoteNames.push(remoteName)
      }

      if (file.isDir()) {
        continue
      }

      const size = file.getSize()
      await this.sendFileSize(size, progressCallback)

      const digest = await this.sendFileData(file, size, binary, escapeCodes, maxBufSize, progressCallback)
      file.closeFile()

      await this.sendFileMD5(digest, progressCallback)
    }

    return remoteNames
  }

  /**
   * Receive file number.
   * @param progressCallback - The progress callback.
   */
  private async recvFileNum (progressCallback: ProgressCallback | null): Promise<number> {
    const num = await this.recvInteger('NUM')
    await this.sendInteger('SUCC', num)
    if (progressCallback != null) {
      progressCallback.onNum(num)
    }
    return num
  }

  /**
   * Receive file name.
   * @param saveParam - The save parameter.
   * @param openSaveFile - The open save file function.
   * @param directory - Whether it's a directory.
   * @param overwrite - Whether to overwrite.
   * @param progressCallback - The progress callback.
   */
  private async recvFileName (
    saveParam: unknown,
    openSaveFile: OpenSaveFile,
    directory: boolean,
    overwrite: boolean,
    progressCallback: ProgressCallback | null
  ): Promise<TrzszFileWriter> {
    const fileName = await this.recvString('NAME')
    const file = await openSaveFile(saveParam, fileName, directory, overwrite)
    this.createdFiles.push(file)
    await this.sendString('SUCC', file.getLocalName())
    if (progressCallback != null) {
      progressCallback.onName(file.getFileName())
    }
    return file
  }

  /**
   * Receive file size.
   * @param progressCallback - The progress callback.
   */
  private async recvFileSize (progressCallback: ProgressCallback | null): Promise<number> {
    const fileSize = await this.recvInteger('SIZE')
    await this.sendInteger('SUCC', fileSize)
    if (progressCallback != null) {
      progressCallback.onSize(fileSize)
    }
    return fileSize
  }

  /**
   * Receive file data.
   * @param file - The file writer.
   * @param size - The file size.
   * @param binary - Whether to use binary mode.
   * @param escapeCodes - The escape codes.
   * @param timeoutInMilliseconds - The timeout in milliseconds.
   * @param progressCallback - The progress callback.
   */
  private async recvFileData (
    file: TrzszFileWriter,
    size: number,
    binary: boolean,
    escapeCodes: number[][],
    timeoutInMilliseconds: number,
    progressCallback: ProgressCallback | null
  ): Promise<Uint8Array> {
    let step = 0
    if (progressCallback != null) {
      progressCallback.onStep(step)
    }
    const md5 = new Md5()
    while (step < size) {
      const beginTime = Date.now()
      const data = await this.recvData(binary, escapeCodes, timeoutInMilliseconds)
      await file.writeFile(data)
      step += data.length
      if (progressCallback != null) {
        progressCallback.onStep(step)
      }
      await this.sendInteger('SUCC', data.length)
      md5.appendByteArray(data)
      const chunkTime = Date.now() - beginTime
      if (chunkTime > this.maxChunkTimeInMilliseconds) {
        this.maxChunkTimeInMilliseconds = chunkTime
      }
    }
    return new Uint8Array((md5.end(true) as Int32Array).buffer)
  }

  /**
   * Receive file MD5.
   * @param digest - The MD5 digest.
   * @param progressCallback - The progress callback.
   */
  private async recvFileMD5 (
    digest: Uint8Array,
    progressCallback: ProgressCallback | null
  ): Promise<void> {
    const expectDigest = await this.recvBinary('MD5')
    if (digest.length !== expectDigest.length) {
      throw new TrzszError('Check MD5 failed')
    }
    for (let j = 0; j < digest.length; j++) {
      if (digest[j] !== expectDigest[j]) {
        throw new TrzszError('Check MD5 failed')
      }
    }
    await this.sendBinary('SUCC', digest)
    if (progressCallback != null) {
      progressCallback.onDone()
    }
  }

  /**
   * Receive files.
   * @param saveParam - The save parameter.
   * @param openSaveFile - The open save file function.
   * @param progressCallback - The progress callback.
   */
  public async recvFiles (
    saveParam: unknown,
    openSaveFile: OpenSaveFile,
    progressCallback: ProgressCallback | null
  ): Promise<string[]> {
    const binary = this.transferConfig.binary === true
    const directory = this.transferConfig.directory === true
    const overwrite = this.transferConfig.overwrite === true
    const timeoutVal = this.transferConfig.timeout as number | undefined
    const timeoutInMilliseconds = typeof timeoutVal === 'number' ? timeoutVal * 1000 : 100000
    const escapeCodes = Array.isArray(this.transferConfig.escape_chars)
      ? escapeCharsToCodes(this.transferConfig.escape_chars as string[][])
      : []

    const num = await this.recvFileNum(progressCallback)

    const localNames: string[] = []
    for (let i = 0; i < num; i++) {
      const file = await this.recvFileName(
        saveParam,
        openSaveFile,
        directory,
        overwrite,
        progressCallback
      )

      if (!localNames.includes(file.getLocalName())) {
        localNames.push(file.getLocalName())
      }

      if (file.isDir()) {
        continue
      }

      this.openedFiles.push(file)

      const size = await this.recvFileSize(progressCallback)

      const digest = await this.recvFileData(
        file,
        size,
        binary,
        escapeCodes,
        timeoutInMilliseconds,
        progressCallback
      )
      file.closeFile()

      await this.recvFileMD5(digest, progressCallback)
    }

    return localNames
  }
}
