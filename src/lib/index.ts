/**
 * trzsz2: https://github.com/zxdong262/trzsz2
 * Copyright(c) 2024 Lonny Wong
 * @license MIT
 *
 * Pure protocol implementation without fs/browser dependencies.
 */

// Export version
export { trzszVersion } from './comm'

// Export types
export type {
  TrzszFile,
  TrzszFileReader,
  TrzszFileWriter,
  OpenSaveFile,
  ProgressCallback,
  TmuxModeType
} from './comm'

// Export interfaces
export type { TrzszOptions } from './options'

// Export classes
export { TrzszError } from './comm'
export { TrzszBuffer } from './buffer'
export { TrzszTransfer } from './transfer'
export { TextProgressBar } from './progress'

// Export utility functions
export {
  strToUint8,
  strToUtf8,
  uint8ToStr,
  strToArrBuf,
  encodeBuffer,
  decodeBuffer,
  checkDuplicateNames,
  isArrayOfType,
  isVT100End,
  stripServerOutput,
  formatSavedFiles,
  stripTmuxStatusLine,
  TmuxMode
} from './comm'

// Export escape functions
export { getEscapeChars, escapeCharsToCodes, escapeData, unescapeData } from './escape'

// Export progress functions
export { getEllipsisString } from './progress'
