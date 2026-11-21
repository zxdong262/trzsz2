import dotenv from 'dotenv'
import fs from 'fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

// Load environment variables from .env file
dotenv.config()

// SSH connection configuration
const SSH_HOST = process.env.TEST_HOST || 'localhost'
const SSH_PORT = parseInt(process.env.TEST_PORT) || 24455
const SSH_USER = process.env.TEST_USER || 'zxd'
const SSH_PASS = process.env.TEST_PASS
const SSH_KEY_PATH = process.env.TEST_KEY_PATH

/**
 * Get SSH connection options
 * @returns {Object} SSH connection options
 */
export function getSshConnectOptions () {
  const options = {
    host: SSH_HOST,
    port: SSH_PORT,
    username: SSH_USER,
    readyTimeout: 30000
  }

  if (SSH_KEY_PATH) {
    options.privateKey = fs.readFileSync(SSH_KEY_PATH)
  } else if (SSH_PASS) {
    options.password = SSH_PASS
  }

  return options
}

// Export SSH configuration for direct use
export const SSH_CONFIG = getSshConnectOptions()

// Read the persisted remote file independently of the trzsz protocol.
export async function verifyTransferredFile (conn, localPath, remoteName, size) {
  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, client) => err ? reject(err) : resolve(client))
  })
  try {
    const remoteHash = createHash('sha256')
    let remoteSize = 0
    for await (const chunk of sftp.createReadStream(remoteName)) {
      remoteHash.update(chunk)
      remoteSize += chunk.length
    }
    const local = await fs.promises.readFile(localPath)
    assert.equal(local.length, size, localPath)
    assert.equal(remoteSize, size, remoteName)
    assert.equal(remoteHash.digest('hex'), createHash('sha256').update(local).digest('hex'), remoteName)
    console.log('[TEST] Verified size and SHA-256:', remoteName)
  } finally {
    sftp.end()
  }
}
