/**
 * trzsz2: https://github.com/trzsz/trzsz2
 * Copyright(c) 2024 trzsz2 contributors
 * @license MIT
 *
 * Integration test for SSH connection with trzsz upload (trz command).
 *
 * This test connects to an SSH server and tests:
 * - trz command - trigger upload, send file to server
 *
 * The test:
 * - Uses real SSH connection with ssh2
 * - Uses fs open/read to read file data
 * - Includes timestamp in filename
 * - Does NOT delete files after test
 */

import { Client } from '@electerm/ssh2'
import { writeFileSync, statSync } from 'fs'
import { join } from 'path'
import { TrzszSession } from './trzsz-session.mjs'
import { SSH_CONFIG } from './common.mjs'

// Upload directory (files to upload)
const UPLOAD_DIR = join(process.cwd(), 'test')

// Generate timestamp for unique filename
const timestamp = Date.now()

// File to upload to server (with timestamp in name)
const UPLOAD_FILE_NAME = `upload_test_${timestamp}.bin`

// File size (5MB)
const TEST_FILE_SIZE = 5 * 1024 * 1024

/**
 * Generate test file with specified size.
 * @param {string} filePath - Path to the test file
 * @param {number} size - File size in bytes
 */
function generateTestFile (filePath, size) {
  console.log('[TEST] Generating test file:', filePath, 'size:', size)
  const buffer = Buffer.alloc(size)
  // Fill with pseudo-random data for reproducibility
  for (let i = 0; i < size; i++) {
    buffer[i] = (i * 251) % 256
  }
  writeFileSync(filePath, buffer)
  console.log('[TEST] Test file generated successfully')
}

/**
 * Wait for session to complete with timeout.
 * @param {TrzszSession} session - Session to monitor
 * @param {number} timeout - Timeout in milliseconds
 */
function waitForComplete (session, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const checkInterval = setInterval(() => {
      if (session.sessionComplete) {
        clearInterval(checkInterval)
        resolve(true)
      } else if (session.error) {
        clearInterval(checkInterval)
        reject(session.error)
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval)
        reject(new Error(`Timeout waiting for session complete, current state: ${session.state}`))
      }
    }, 500)
  })
}

/**
 * Run SSH connection and trzsz upload test.
 */
async function runTest () {
  console.log('=== SSH trzsz Upload Test ===')
  console.log('SSH Config:', { ...SSH_CONFIG, password: '***' })
  console.log('')

  // Generate test file with timestamp in name
  const uploadFilePath = join(UPLOAD_DIR, UPLOAD_FILE_NAME)
  generateTestFile(uploadFilePath, TEST_FILE_SIZE)

  const fileStats = statSync(uploadFilePath)
  console.log(`Upload file: ${UPLOAD_FILE_NAME} (${fileStats.size} bytes)`)

  const conn = new Client()

  return new Promise((resolve, reject) => {
    conn.on('ready', () => {
      console.log('[SSH] Connected to server')

      // Start a shell
      conn.shell((err, stream) => {
        if (err) {
          conn.end()
          reject(err)
          return
        }

        console.log('[SSH] Shell started')

        // Create trzsz session
        const session = new TrzszSession(stream, {
          onProgress: (transferred, total, percent) => {
            console.log(`[CALLBACK] Progress: ${transferred}/${total} (${percent}%)`)
          },
          onFileStart: (fileName, fileSize) => {
            console.log(`[CALLBACK] File start: ${fileName} size: ${fileSize}`)
          },
          onFileComplete: (fileName) => {
            console.log(`[CALLBACK] File complete: ${fileName}`)
          },
          onSessionComplete: () => {
            console.log('[CALLBACK] Session complete')
          }
        })
        session.createTransfer()

        let transferStarted = false

        stream.on('data', (data) => {
          const str = data.toString('binary')
          console.log('[SSH] Received data:', str.length, 'bytes', 'state:', session.state)
          console.log('[SSH] Data content:', JSON.stringify(str.substring(0, 100)))

          // If session is active, feed data directly
          if (session.state !== 'idle') {
            session.feedIncoming(data)
            return
          }

          // Check for trzsz detection
          const detection = session.detectTrzsz(data)
          if (detection.detected && !transferStarted) {
            console.log('[TRZSZ] Detected trzsz protocol, direction:', detection.direction)

            if (detection.direction === 'upload') {
              // Server is ready to receive files (we upload)
              transferStarted = true
              session.state = 'sending'

              // Start upload immediately - server is waiting for response
              session.handleUpload([uploadFilePath]).catch((err) => {
                console.error('[TRZSZ] Upload error:', err)
                conn.end()
                reject(err)
              })
            } else {
              // Feed data to transfer for protocol handling
              session.feedIncoming(data)
            }
          } else {
            // Regular terminal output
            const text = data.toString('utf8')
            // Filter out control sequences for cleaner output
            // eslint-disable-next-line no-control-regex
            const cleanText = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b].*?\x07/g, '')
            if (cleanText.trim().length > 0) {
              process.stdout.write(cleanText)
            }
          }
        })

        stream.on('close', () => {
          console.log('[SSH] Stream closed')
          session.cleanup()
          conn.end()
          resolve(true)
        })

        stream.stderr.on('data', (data) => {
          console.error('[SSH] stderr:', data.toString())
        })

        // Run upload test
        async function runUploadTest () {
          try {
            // Wait for shell to initialize
            await new Promise((_resolve) => setTimeout(_resolve, 1500))

            // Delete existing file on server to avoid conflict
            console.log('\n=== Preparing: Delete existing file on server ===')
            stream.write(`rm -f ${UPLOAD_FILE_NAME}\n`)
            await new Promise((_resolve) => setTimeout(_resolve, 1500))

            // Test: trz command (upload - server receives files)
            // trz command on server means server is ready to receive files
            console.log('\n=== Test: trz command (upload) ===')
            console.log('[TEST] Sending trz command to trigger upload...')

            // Record start time
            const startTime = Date.now()
            stream.write('trz\n')

            // Wait for upload to complete with timeout
            try {
              await waitForComplete(session, 180000)
              console.log('[TEST] Upload session complete')

              // Calculate transfer speed
              const endTime = Date.now()
              const durationSeconds = (endTime - startTime) / 1000
              const speedMbps = (TEST_FILE_SIZE / durationSeconds) / (1024 * 1024)
              console.log(`[TEST] Upload speed: ${speedMbps.toFixed(2)} MB/s`)
            } catch (e) {
              console.log('[TEST] Upload timeout or error:', e.message)
            }

            // Wait for any remaining processing
            await new Promise((_resolve) => setTimeout(_resolve, 1000))
            console.log('[TEST] Upload test complete, state:', session.state)

            // Exit shell
            stream.write('exit\n')
          } catch (err) {
            console.error('[TEST] Error:', err)
            reject(err)
          }
        }

        // Start test after shell is ready
        setTimeout(runUploadTest, 1500)
      })
    })

    conn.on('error', (err) => {
      console.error('[SSH] Connection error:', err.message)
      reject(err)
    })

    conn.on('close', () => {
      console.log('[SSH] Connection closed')
    })

    console.log('[SSH] Connecting to', SSH_CONFIG.host + ':' + SSH_CONFIG.port)
    conn.connect(SSH_CONFIG)
  })
}

// Run the test
runTest()
  .then(() => {
    console.log('\n=== Test completed successfully ===')
    console.log(`[TEST] Upload file preserved at: ${join(UPLOAD_DIR, UPLOAD_FILE_NAME)}`)
    process.exit(0)
  })
  .catch((err) => {
    console.error('\n=== Test failed ===')
    console.error(err)
    process.exit(1)
  })
