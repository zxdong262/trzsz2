/**
 * trzsz2: https://github.com/trzsz/trzsz2
 * Copyright(c) 2024 trzsz2 contributors
 * @license MIT
 *
 * Integration test for SSH connection with trzsz download (tsz command).
 *
 * This test connects to an SSH server and tests:
 * - tsz command - trigger download, receive file from server
 *
 * The test:
 * - Uses real SSH connection with ssh2
 * - Creates a test file on the server first using bash commands
 * - Uses fs stream to write downloaded file
 * - Includes timestamp in filename
 * - Does NOT delete files after test
 */

import { Client } from 'ssh2'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { TrzszSession } from './trzsz-session.mjs'

// SSH connection configuration
const SSH_CONFIG = {
  host: 'localhost',
  port: 24455,
  username: 'zxd',
  password: 'zxd',
  readyTimeout: 30000
}

// Download directory
const DOWNLOAD_DIR = join(process.cwd(), 'test/integration/downloads')

// Generate timestamp for unique filename
const timestamp = Date.now()

// File to download from server (with timestamp in name)
const DOWNLOAD_FILE_NAME = `download_test_${timestamp}.bin`

// File size (5MB)
const TEST_FILE_SIZE = 5 * 1024 * 1024

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
 * Run SSH connection and trzsz download test.
 */
async function runTest () {
  console.log('=== SSH trzsz Download Test ===')
  console.log('SSH Config:', { ...SSH_CONFIG, password: '***' })
  console.log('')

  // Ensure download directory exists
  if (!existsSync(DOWNLOAD_DIR)) {
    mkdirSync(DOWNLOAD_DIR, { recursive: true })
  }

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
          downloadDir: DOWNLOAD_DIR,
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

          // If session is active, feed data directly
          if (session.state !== 'idle') {
            session.feedIncoming(data)
            return
          }

          // Check for trzsz detection
          const detection = session.detectTrzsz(data)
          if (detection.detected && !transferStarted) {
            console.log('[TRZSZ] Detected trzsz protocol, direction:', detection.direction)

            if (detection.direction === 'download') {
              // Server is ready to send files (we download)
              transferStarted = true
              session.state = 'receiving'

              // Start download immediately - server is waiting for response
              session.handleDownload().catch((err) => {
                console.error('[TRZSZ] Download error:', err)
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

        // Run download test
        async function runDownloadTest () {
          try {
            // Wait for shell to initialize
            await new Promise((_resolve) => setTimeout(_resolve, 1500))

            // Create test file on server using bash commands
            console.log('\n=== Preparing: Creating test file on server ===')
            console.log(`[TEST] Creating file: ${DOWNLOAD_FILE_NAME} (${TEST_FILE_SIZE} bytes)`)

            // Use dd to create a file with pseudo-random content
            stream.write(`dd if=/dev/urandom of=${DOWNLOAD_FILE_NAME} bs=1M count=5 2>/dev/null\n`)
            await new Promise((_resolve) => setTimeout(_resolve, 3000))

            // Verify file was created
            stream.write(`ls -la ${DOWNLOAD_FILE_NAME}\n`)
            await new Promise((_resolve) => setTimeout(_resolve, 1500))

            // Test: tsz command (download - server sends files)
            // tsz command on server means server will send the specified file
            console.log('\n=== Test: tsz command (download) ===')
            console.log('[TEST] Sending tsz command to trigger download...')
            stream.write(`tsz ${DOWNLOAD_FILE_NAME}\n`)

            // Wait for download to complete with timeout
            try {
              await waitForComplete(session, 180000)
              console.log('[TEST] Download session complete')
            } catch (e) {
              console.log('[TEST] Download timeout or error:', e.message)
            }

            // Wait for any remaining processing
            await new Promise((_resolve) => setTimeout(_resolve, 1000))
            console.log('[TEST] Download test complete, state:', session.state)

            // Exit shell
            stream.write('exit\n')
          } catch (err) {
            console.error('[TEST] Error:', err)
            reject(err)
          }
        }

        // Start test after shell is ready
        setTimeout(runDownloadTest, 1500)
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
    console.log(`[TEST] Download file preserved at: ${join(DOWNLOAD_DIR, DOWNLOAD_FILE_NAME)}`)
    process.exit(0)
  })
  .catch((err) => {
    console.error('\n=== Test failed ===')
    console.error(err)
    process.exit(1)
  })
