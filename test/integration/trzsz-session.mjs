/**
 * trzsz2: https://github.com/trzsz/trzsz2
 * Copyright(c) 2024 trzsz2 contributors
 * @license MIT
 *
 * Trzsz session helper for integration tests.
 *
 * This module provides a reusable trzsz session handler that works with
 * SSH2 shell streams for real file transfer testing.
 */

import { openSync, readSync, closeSync, existsSync, mkdirSync, createWriteStream, statSync } from 'fs'
import { join, basename, extname } from 'path'
import { TrzszTransfer } from '../../dist/esm/index.js'

/**
 * Generate a unique filename if file already exists.
 * Adds .1, .2, .3 etc. suffix before the extension.
 * @param {string} dir - Directory path
 * @param {string} fileName - Original file name
 * @returns {string} - Unique file path
 */
function getUniqueFilePath (dir, fileName) {
  let filePath = join(dir, fileName)

  if (!existsSync(filePath)) {
    return filePath
  }

  // File exists, need to rename
  const ext = extname(fileName)
  const baseName = basename(fileName, ext)
  let counter = 1

  while (existsSync(filePath)) {
    const newFileName = `${baseName}.${counter}${ext}`
    filePath = join(dir, newFileName)
    counter++
  }

  return filePath
}

/**
 * TrzszFileReader implementation for reading files from disk.
 */
class FileReader {
  constructor (filePath, fileName) {
    this.filePath = filePath
    this.fileName = fileName
    this.fd = null
    this.size = 0
    this.offset = 0
    this.pathId = 0
    this.relPath = [fileName]
    this.isDirectory = false
  }

  /**
   * Open the file for reading.
   */
  open () {
    const stats = statSync(this.filePath)
    this.size = stats.size
    this.fd = openSync(this.filePath, 'r')
  }

  getPathId () {
    return this.pathId
  }

  getRelPath () {
    return this.relPath
  }

  isDir () {
    return this.isDirectory
  }

  getSize () {
    return this.size
  }

  /**
   * Read file data.
   * @param {ArrayBuffer} buf - Buffer to read into
   * @returns {Promise<Uint8Array>} - Data read from file
   */
  async readFile (buf) {
    const buffer = Buffer.from(buf)
    const bytesRead = readSync(this.fd, buffer, 0, buffer.length, this.offset)
    this.offset += bytesRead
    return new Uint8Array(buffer.slice(0, bytesRead))
  }

  closeFile () {
    if (this.fd !== null) {
      closeSync(this.fd)
      this.fd = null
    }
  }
}

/**
 * TrzszFileWriter implementation for writing files to disk.
 */
class FileWriter {
  constructor (filePath, fileName) {
    this.filePath = filePath
    this.fileName = fileName
    this.localName = fileName
    this.isDirectory = false
    this.writeStream = null
  }

  getFileName () {
    return this.fileName
  }

  getLocalName () {
    return this.localName
  }

  isDir () {
    return this.isDirectory
  }

  /**
   * Write data to file.
   * @param {Uint8Array} buf - Data to write
   */
  async writeFile (buf) {
    if (this.writeStream === null) {
      this.writeStream = createWriteStream(this.filePath)
    }
    return new Promise((resolve, reject) => {
      this.writeStream.write(Buffer.from(buf), (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  /**
   * Delete the file.
   */
  async deleteFile () {
    if (this.writeStream !== null) {
      this.writeStream.close()
      this.writeStream = null
    }
    return this.filePath
  }

  closeFile () {
    if (this.writeStream !== null) {
      this.writeStream.close()
      this.writeStream = null
    }
  }
}

/**
 * TrzszSession class for handling trzsz transfers.
 */
export class TrzszSession {
  constructor (stream, options = {}) {
    this.stream = stream
    this.options = {
      downloadDir: options.downloadDir || './downloads',
      onProgress: options.onProgress || null,
      onFileStart: options.onFileStart || null,
      onFileComplete: options.onFileComplete || null,
      onSessionComplete: options.onSessionComplete || null
    }
    this.transfer = null
    this.state = 'idle' // idle, detected, sending, receiving, complete, error
    this.sessionComplete = false
    this.error = null
    this.currentFileName = ''
    this.currentFileSize = 0
    this.bytesTransferred = 0
    this.pendingData = []
    this.fileReaders = []
    this.fileWriters = []
    this.transferPromise = null
    this.resolveTransfer = null
    this.rejectTransfer = null
  }

  /**
   * Create and initialize a TrzszTransfer instance.
   */
  createTransfer () {
    // Clean up existing transfer if any
    if (this.transfer) {
      this.transfer.cleanup()
    }
    this.transfer = new TrzszTransfer((data) => {
      console.log('[TRZSZ] Sending to server:', data.length, 'bytes')
      console.log('[TRZSZ] Send content:', JSON.stringify(data.toString('binary').substring(0, 200)))
      this.stream.write(data)
    }, false)
    return this.transfer
  }

  /**
   * Detect trzsz protocol header in incoming data.
   * The trzsz protocol sends: ::TRZSZ:TRANSFER:R:version:timestamp:pid
   * R = server ready to receive (upload)
   * S = server ready to send (download)
   */
  detectTrzsz (data) {
    const str = data.toString('binary')

    // Check for trzsz transfer header: ::TRZSZ:TRANSFER:
    const trzszIndex = str.indexOf('::TRZSZ:TRANSFER:')
    if (trzszIndex !== -1) {
      // Parse the direction: R (receive) or S (send)
      const afterHeader = str.substring(trzszIndex + 17)
      const direction = afterHeader.charAt(0)
      console.log('[TRZSZ] Detected ::TRZSZ:TRANSFER: direction:', direction)

      if (direction === 'R') {
        // Server is ready to receive files (we upload)
        return { detected: true, direction: 'upload', startIndex: trzszIndex }
      } else if (direction === 'S') {
        // Server is ready to send files (we download)
        return { detected: true, direction: 'download', startIndex: trzszIndex }
      }
    }

    // Also check for #ACT: (protocol messages)
    const actIndex = str.indexOf('#ACT:')
    const failIndex = str.indexOf('#FAIL:')
    const exitIndex = str.indexOf('#EXIT:')

    if (actIndex !== -1) {
      console.log('[TRZSZ] Detected #ACT: - trzsz protocol detected')
      return { detected: true, direction: 'protocol', type: 'ACT', startIndex: actIndex }
    }
    if (failIndex !== -1) {
      console.log('[TRZSZ] Detected #FAIL: - trzsz protocol detected')
      return { detected: true, direction: 'protocol', type: 'FAIL', startIndex: failIndex }
    }
    if (exitIndex !== -1) {
      console.log('[TRZSZ] Detected #EXIT: - trzsz protocol detected')
      return { detected: true, direction: 'protocol', type: 'EXIT', startIndex: exitIndex }
    }

    return { detected: false, direction: null, startIndex: -1 }
  }

  /**
   * Handle upload (trz command - server receives files, we send files).
   * @param {string[]} filePaths - Files to upload
   */
  async handleUpload (filePaths) {
    console.log('[TRZSZ] Starting upload for files:', filePaths)

    try {
      // Client sends ACT first (we detected server is ready to receive)
      // Do this IMMEDIATELY before any file operations to avoid timeout
      // confirm=true means we want to upload files
      console.log('[TRZSZ] Sending action to server...')
      await this.transfer.sendAction(true, false)

      // Now open files while waiting for server response
      this.fileReaders = filePaths.map(path => {
        const fileName = basename(path)
        const reader = new FileReader(path, fileName)
        reader.open()
        console.log(`[TRZSZ] Opened file: ${fileName}, size: ${reader.size}`)
        return reader
      })

      // Server sends CFG directly (not ACT) when it's ready to receive
      console.log('[TRZSZ] Waiting for config from server...')
      const config = await this.transfer.recvConfig()
      console.log('[TRZSZ] Received config:', config)

      // Don't send CFG back - just start sending files
      // The server is waiting for #NUM: directly

      // Send files
      const progressCallback = this.options.onProgress
        ? {
            onNum: (num) => console.log(`[TRZSZ] Number of files: ${num}`),
            onName: (name) => {
              console.log(`[TRZSZ] Sending file: ${name}`)
              if (this.options.onFileStart) {
                this.options.onFileStart(name, 0)
              }
            },
            onSize: (size) => console.log(`[TRZSZ] File size: ${size}`),
            onStep: (step) => {
              if (this.options.onProgress) {
                this.options.onProgress(
                  step,
                  this.fileReaders[0]?.size || 0,
                  Math.round((step / (this.fileReaders[0]?.size || 1)) * 100)
                )
              }
            },
            onDone: () => {
              console.log('[TRZSZ] File done')
              if (this.options.onFileComplete) {
                this.options.onFileComplete(this.fileReaders[0]?.fileName || '')
              }
            }
          }
        : null

      const remoteNames = await this.transfer.sendFiles(this.fileReaders, progressCallback)
      console.log('[TRZSZ] Files sent successfully, remote names:', remoteNames)

      // Send EXIT message to server to signal transfer completion
      console.log('[TRZSZ] Sending EXIT to server')
      await this.transfer.clientExit('Success')

      this.state = 'complete'
      this.sessionComplete = true

      if (this.options.onSessionComplete) {
        this.options.onSessionComplete()
      }

      // Close all file readers
      for (const reader of this.fileReaders) {
        reader.closeFile()
      }

      if (this.resolveTransfer) {
        this.resolveTransfer(remoteNames)
      }

      return remoteNames
    } catch (err) {
      console.error('[TRZSZ] Upload error:', err)
      this.state = 'error'
      this.error = err

      // Close all file readers
      for (const reader of this.fileReaders) {
        reader.closeFile()
      }

      if (this.rejectTransfer) {
        this.rejectTransfer(err)
      }

      throw err
    }
  }

  /**
   * Handle download (tsz command - server sends files, we receive files).
   */
  async handleDownload () {
    console.log('[TRZSZ] Starting download')

    try {
      // Client sends ACT first (we detected server is ready to send)
      // confirm=true means we want to download files
      console.log('[TRZSZ] Sending action to server...')
      await this.transfer.sendAction(true, false)

      // Server sends CFG directly (not ACT) when it's ready to send
      console.log('[TRZSZ] Waiting for config from server...')
      const config = await this.transfer.recvConfig()
      console.log('[TRZSZ] Received config:', config)

      // Don't send CFG back - just wait for files

      // Receive files
      const downloadDir = this.options.downloadDir
      if (!existsSync(downloadDir)) {
        mkdirSync(downloadDir, { recursive: true })
      }

      const openSaveFile = async (saveParam, fileName, directory, overwrite) => {
        console.log(`[TRZSZ] Opening save file: ${fileName}`)
        const filePath = getUniqueFilePath(downloadDir, fileName)
        const writer = new FileWriter(filePath, fileName)
        this.fileWriters.push(writer)

        if (this.options.onFileStart) {
          this.options.onFileStart(fileName, 0)
        }

        return writer
      }

      const progressCallback = this.options.onProgress
        ? {
            onNum: (num) => console.log(`[TRZSZ] Number of files: ${num}`),
            onName: (name) => console.log(`[TRZSZ] Receiving file: ${name}`),
            onSize: (size) => {
              console.log(`[TRZSZ] File size: ${size}`)
              this.currentFileSize = size
            },
            onStep: (step) => {
              if (this.options.onProgress) {
                this.options.onProgress(
                  step,
                  this.currentFileSize,
                  Math.round((step / (this.currentFileSize || 1)) * 100)
                )
              }
            },
            onDone: () => {
              console.log('[TRZSZ] File done')
              if (this.options.onFileComplete) {
                this.options.onFileComplete(
                  this.fileWriters[this.fileWriters.length - 1]?.fileName || ''
                )
              }
            }
          }
        : null

      const savedFiles = await this.transfer.recvFiles(
        downloadDir,
        openSaveFile,
        progressCallback
      )
      console.log('[TRZSZ] Files received successfully:', savedFiles)

      // Send EXIT message to server to signal transfer completion
      console.log('[TRZSZ] Sending EXIT to server')
      await this.transfer.clientExit('Success')

      this.state = 'complete'
      this.sessionComplete = true

      // Close all file writers
      for (const writer of this.fileWriters) {
        writer.closeFile()
      }

      if (this.options.onSessionComplete) {
        this.options.onSessionComplete()
      }

      if (this.resolveTransfer) {
        this.resolveTransfer(savedFiles)
      }

      return savedFiles
    } catch (err) {
      console.error('[TRZSZ] Download error:', err)
      this.state = 'error'
      this.error = err

      // Close all file writers
      for (const writer of this.fileWriters) {
        writer.closeFile()
      }

      if (this.rejectTransfer) {
        this.rejectTransfer(err)
      }

      throw err
    }
  }

  /**
   * Feed incoming data to the transfer.
   */
  feedIncoming (data) {
    if (this.transfer) {
      console.log('[TRZSZ] Feeding data to transfer:', data.length, 'bytes')
      console.log('[TRZSZ] Data content:', JSON.stringify(data.toString('binary').substring(0, 200)))
      this.transfer.addReceivedData(data)
    }
  }

  /**
   * Wait for session to complete with timeout.
   */
  waitForComplete (timeout = 120000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()
      const checkInterval = setInterval(() => {
        if (this.sessionComplete) {
          clearInterval(checkInterval)
          resolve(true)
        } else if (this.error) {
          clearInterval(checkInterval)
          reject(this.error)
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval)
          reject(new Error(`Timeout waiting for session complete, current state: ${this.state}`))
        }
      }, 500)
    })
  }

  /**
   * Cleanup resources.
   */
  cleanup () {
    for (const reader of this.fileReaders) {
      reader.closeFile()
    }
    for (const writer of this.fileWriters) {
      writer.closeFile()
    }
    if (this.transfer) {
      this.transfer.cleanup()
    }
  }
}

export default TrzszSession
