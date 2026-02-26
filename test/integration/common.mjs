import dotenv from 'dotenv'
import fs from 'fs'

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
