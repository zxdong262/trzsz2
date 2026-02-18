/**
 * trzsz2: https://github.com/zxdong262/trzsz2
 * Copyright(c) 2024 Lonny Wong
 * @license MIT
 *
 * Pure protocol implementation without fs/browser dependencies.
 */

import type { ProgressCallback } from './comm'

/**
 * Get the display length of a string (Chinese characters count as 2).
 * @param str - The input string.
 * @return The display length.
 */
function getLength (str: string): number {
  return str.replace(/[\u4e00-\u9fa5]/g, '**').length
}

/**
 * Get ellipsis string if the string is too long.
 * @param str - The input string.
 * @param max - The maximum length.
 * @return The ellipsis string and its length.
 */
export function getEllipsisString (str: string, max: number): { sub: string, len: number } {
  max -= 3
  let len = 0
  let sub = ''
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) >= 0x4e00 && str.charCodeAt(i) <= 0x9fa5) {
      if (len + 2 > max) {
        return { sub: sub + '...', len: len + 3 }
      }
      len += 2
    } else {
      if (len + 1 > max) {
        return { sub: sub + '...', len: len + 3 }
      }
      len += 1
    }
    sub += str[i]
  }
  return { sub: sub + '...', len: len + 3 }
}

/**
 * Convert size to human-readable string.
 * @param size - The size in bytes.
 * @return The human-readable string.
 */
function convertSizeToString (size: number): string {
  let unit = 'B'
  do {
    if (size < 1024) {
      break
    }
    size = size / 1024
    unit = 'KB'

    if (size < 1024) {
      break
    }
    size = size / 1024
    unit = 'MB'

    if (size < 1024) {
      break
    }
    size = size / 1024
    unit = 'GB'

    if (size < 1024) {
      break
    }
    size = size / 1024
    unit = 'TB'
  } while (false)

  if (size >= 100) {
    return `${size.toFixed(0)} ${unit}`
  } else if (size >= 10) {
    return `${size.toFixed(1)} ${unit}`
  } else {
    return `${size.toFixed(2)} ${unit}`
  }
}

/**
 * Convert time to human-readable string.
 * @param seconds - The time in seconds.
 * @return The human-readable string.
 */
function convertTimeToString (seconds: number): string {
  let result = ''
  if (seconds >= 3600) {
    result += Math.floor(seconds / 3600).toString() + ':'
    seconds %= 3600
  }

  const minute = Math.floor(seconds / 60)
  result += minute >= 10 ? minute.toString() : '0' + minute.toString()
  result += ':'

  const second = Math.round(seconds % 60)
  result += second >= 10 ? second.toString() : '0' + second.toString()

  return result
}

const kSpeedArraySize: number = 30

/**
 * TextProgressBar class for displaying file transfer progress.
 */
export class TextProgressBar implements ProgressCallback {
  private readonly writer: (output: string) => void
  private lastUpdateTime: number = 0
  private columns: number
  private fileCount: number = 0
  private fileIdx: number = 0
  private fileName: string = ''
  private fileSize: number = 0
  private fileStep: number = 0
  private startTime: number = 0
  private tmuxPaneColumns: number
  private firstWrite: boolean = true
  private speedCnt: number = 0
  private speedIdx: number = 0
  private timeArray: number[] = new Array(kSpeedArraySize)
  private stepArray: number[] = new Array(kSpeedArraySize)

  /**
   * Create a TextProgressBar.
   * @param writer - The output writer function.
   * @param columns - The terminal columns.
   * @param tmuxPaneColumns - The tmux pane columns (optional).
   */
  public constructor (
    writer: (output: string) => void,
    columns: number,
    tmuxPaneColumns: number | undefined = undefined
  ) {
    this.writer = writer
    this.tmuxPaneColumns = tmuxPaneColumns ?? 0
    // -1 to avoid xterm.js messing up the tmux pane
    this.columns = this.tmuxPaneColumns > 1 ? this.tmuxPaneColumns - 1 : columns
  }

  /**
   * Set the terminal columns.
   * @param columns - The terminal columns.
   */
  public setTerminalColumns (columns: number): void {
    this.columns = columns
    // resizing tmux panes is not supported
    if (this.tmuxPaneColumns > 0) {
      this.tmuxPaneColumns = 0
    }
  }

  /**
   * Called when the number of files is known.
   * @param num - The number of files.
   */
  public onNum (num: number): void {
    this.fileCount = num
    this.fileIdx = 0
  }

  /**
   * Called when a file name is known.
   * @param name - The file name.
   */
  public onName (name: string): void {
    this.fileName = name
    this.fileIdx += 1
    this.startTime = Date.now()
    this.timeArray[0] = this.startTime
    this.stepArray[0] = 0
    this.speedCnt = 1
    this.speedIdx = 1
    this.fileStep = -1
  }

  /**
   * Called when the file size is known.
   * @param size - The file size.
   */
  public onSize (size: number): void {
    this.fileSize = size
  }

  /**
   * Called when a step is completed.
   * @param step - The step number.
   */
  public onStep (step: number): void {
    if (step <= this.fileStep) {
      return
    }
    this.fileStep = step
    this.showProgress()
  }

  /**
   * Hide the cursor.
   */
  public hideCursor (): void {
    this.writer('\x1b[?25l')
  }

  /**
   * Show the cursor.
   */
  public showCursor (): void {
    this.writer('\x1b[?25h')
  }

  /**
   * Show the progress.
   */
  private showProgress (): void {
    const now = Date.now()
    if (now - this.lastUpdateTime < 200) {
      return
    }
    this.lastUpdateTime = now

    let percentage = '100%'
    if (this.fileSize !== 0) {
      percentage = Math.round((this.fileStep * 100) / this.fileSize).toString() + '%'
    }
    const total = convertSizeToString(this.fileStep)
    const speed = this.getSpeed(now)
    let speedStr = '--- B/s'
    let etaStr = '--- ETA'
    if (speed > 0) {
      speedStr = convertSizeToString(speed) + '/s'
      etaStr = convertTimeToString(Math.round((this.fileSize - this.fileStep) / speed)) + ' ETA'
    }

    const progressText = this.getProgressText(percentage, total, speedStr, etaStr)

    if (this.firstWrite) {
      this.firstWrite = false
      this.writer(progressText)
      return
    }

    if (this.tmuxPaneColumns > 0) {
      this.writer(`\x1b[${this.columns}D${progressText}`)
    } else {
      this.writer(`\r${progressText}`)
    }
  }

  /**
   * Get the current transfer speed.
   * @param now - The current time.
   * @return The speed in bytes per second.
   */
  private getSpeed (now: number): number {
    let speed: number
    if (this.speedCnt <= kSpeedArraySize) {
      this.speedCnt++
      speed = ((this.fileStep - this.stepArray[0]) * 1000) / (now - this.timeArray[0])
    } else {
      speed =
        ((this.fileStep - this.stepArray[this.speedIdx]) * 1000) /
        (now - this.timeArray[this.speedIdx])
    }

    this.timeArray[this.speedIdx] = now
    this.stepArray[this.speedIdx] = this.fileStep

    this.speedIdx++
    if (this.speedIdx >= kSpeedArraySize) {
      this.speedIdx %= kSpeedArraySize
    }

    return isFinite(speed) ? speed : -1
  }

  /**
   * Get the progress text.
   * @param percentage - The percentage string.
   * @param total - The total string.
   * @param speed - The speed string.
   * @param eta - The ETA string.
   * @return The progress text.
   */
  private getProgressText (
    percentage: string,
    total: string,
    speed: string,
    eta: string
  ): string {
    const barMinLength = 24
    let left =
      this.fileCount > 1 ? `(${this.fileIdx}/${this.fileCount}) ${this.fileName}` : this.fileName
    let leftLength = getLength(left)
    let right = ` ${percentage} | ${total} | ${speed} | ${eta}`

    do {
      if (this.columns - leftLength - right.length >= barMinLength) {
        break
      }
      if (leftLength > 50) {
        ;({ sub: left, len: leftLength } = getEllipsisString(left, 50))
      }

      if (this.columns - leftLength - right.length >= barMinLength) {
        break
      }
      if (leftLength > 40) {
        ;({ sub: left, len: leftLength } = getEllipsisString(left, 40))
      }

      if (this.columns - leftLength - right.length >= barMinLength) {
        break
      }
      right = ` ${percentage} | ${speed} | ${eta}`

      if (this.columns - leftLength - right.length >= barMinLength) {
        break
      }
      if (leftLength > 30) {
        ;({ sub: left, len: leftLength } = getEllipsisString(left, 30))
      }

      if (this.columns - leftLength - right.length >= barMinLength) {
        break
      }
      right = ` ${percentage} | ${eta}`

      if (this.columns - leftLength - right.length >= barMinLength) {
        break
      }
      right = ` ${percentage}`

      if (this.columns - leftLength - right.length >= barMinLength) {
        break
      }
      if (leftLength > 20) {
        ;({ sub: left, len: leftLength } = getEllipsisString(left, 20))
      }

      if (this.columns - leftLength - right.length >= barMinLength) {
        break
      }
      left = ''
      leftLength = 0
    } while (false)

    let barLength = this.columns - right.length
    if (leftLength > 0) {
      barLength -= leftLength + 1
      left += ' '
    }

    const bar = this.getProgressBar(barLength)
    return (left + bar + right).trim()
  }

  /**
   * Get the progress bar string.
   * @param len - The length of the bar.
   * @return The progress bar string.
   */
  private getProgressBar (len: number): string {
    if (len < 12) {
      return ''
    }
    const total = len - 2
    let complete = total
    if (this.fileSize !== 0) {
      complete = Math.round((total * this.fileStep) / this.fileSize)
    }
    return '[\u001b[36m' + '\u2588'.repeat(complete) + '\u2591'.repeat(total - complete) + '\u001b[0m]'
  }

  /**
   * Called when the transfer is done.
   */
  public onDone (): void {
    if (this.fileSize === 0) {
      return
    }
    this.fileStep = this.fileSize
    this.lastUpdateTime = 0
    this.showProgress()
  }
}
