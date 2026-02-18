/**
 * trzsz2: https://github.com/trzsz/trzsz2
 * Copyright(c) 2024 trzsz2 contributors
 * @license MIT
 */

import { describe, test, expect, beforeEach } from 'vitest'
import { TextProgressBar, getEllipsisString } from '../../src/progress'

describe('getEllipsisString', () => {
  test('should return string with ellipsis', () => {
    const result = getEllipsisString('hello world', 8)
    expect(result.sub).toBe('hello...')
    expect(result.len).toBe(8)
  })

  test('should handle Chinese characters', () => {
    // Chinese characters count as 2 display length each
    // max=6, max-3=3, so only 1 Chinese char (len=2) fits, then add '...'
    const result = getEllipsisString('中文测试', 6)
    expect(result.sub).toBe('中...')
    expect(result.len).toBe(5) // 2 + 3
  })

  test('should handle short string', () => {
    const result = getEllipsisString('hi', 10)
    expect(result.sub).toBe('hi...')
    expect(result.len).toBe(5)
  })

  test('should handle empty string', () => {
    const result = getEllipsisString('', 10)
    expect(result.sub).toBe('...')
    expect(result.len).toBe(3)
  })

  test('should handle mixed content', () => {
    const result = getEllipsisString('test中文test', 10)
    expect(result.sub).toBeDefined()
    expect(result.sub.endsWith('...')).toBe(true)
  })
})

describe('TextProgressBar', () => {
  let output: string[]
  let writer: (str: string) => void

  beforeEach(() => {
    output = []
    writer = (str: string) => output.push(str)
  })

  test('should create progress bar', () => {
    const bar = new TextProgressBar(writer, 80)
    expect(bar).toBeDefined()
  })

  test('should handle onNum', () => {
    const bar = new TextProgressBar(writer, 80)
    bar.onNum(5)
    // No direct way to verify, but should not throw
  })

  test('should handle onName', () => {
    const bar = new TextProgressBar(writer, 80)
    bar.onNum(2)
    bar.onName('test.txt')
    // Should not throw
  })

  test('should handle onSize', () => {
    const bar = new TextProgressBar(writer, 80)
    bar.onNum(1)
    bar.onName('test.txt')
    bar.onSize(1024)
    // Should not throw
  })

  test('should handle onStep', () => {
    vi.useFakeTimers()
    const bar = new TextProgressBar(writer, 80)
    bar.onNum(1)
    bar.onName('test.txt')
    bar.onSize(1024)

    // First step should trigger output
    bar.onStep(512)
    vi.advanceTimersByTime(250)
    bar.onStep(768)

    expect(output.length).toBeGreaterThan(0)
    vi.useRealTimers()
  })

  test('should handle onDone', () => {
    vi.useFakeTimers()
    const bar = new TextProgressBar(writer, 80)
    bar.onNum(1)
    bar.onName('test.txt')
    bar.onSize(1024)
    bar.onStep(512)
    vi.advanceTimersByTime(250)
    bar.onDone()

    expect(output.length).toBeGreaterThan(0)
    vi.useRealTimers()
  })

  test('should handle zero file size', () => {
    const bar = new TextProgressBar(writer, 80)
    bar.onNum(1)
    bar.onName('test.txt')
    bar.onSize(0)
    bar.onDone()
    // Should not throw and no output for zero size
  })

  test('should hide and show cursor', () => {
    const bar = new TextProgressBar(writer, 80)
    bar.hideCursor()
    expect(output).toContain('\x1b[?25l')
    bar.showCursor()
    expect(output).toContain('\x1b[?25h')
  })

  test('should handle tmux pane columns', () => {
    const bar = new TextProgressBar(writer, 80, 100)
    bar.onNum(1)
    bar.onName('test.txt')
    bar.onSize(1024)
    bar.onStep(512)
    // Should not throw
  })

  test('should set terminal columns', () => {
    const bar = new TextProgressBar(writer, 80)
    bar.setTerminalColumns(120)
    // Should not throw
  })

  test('should handle multiple files', () => {
    vi.useFakeTimers()
    const bar = new TextProgressBar(writer, 80)
    bar.onNum(3)

    bar.onName('file1.txt')
    bar.onSize(1024)
    vi.advanceTimersByTime(250)
    bar.onStep(1024)

    bar.onName('file2.txt')
    bar.onSize(2048)
    vi.advanceTimersByTime(250)
    bar.onStep(2048)

    bar.onName('file3.txt')
    bar.onSize(512)
    vi.advanceTimersByTime(250)
    bar.onStep(512)

    expect(output.length).toBeGreaterThan(0)
    vi.useRealTimers()
  })

  test('should not update too frequently', () => {
    vi.useFakeTimers()
    const bar = new TextProgressBar(writer, 80)
    bar.onNum(1)
    bar.onName('test.txt')
    bar.onSize(10000)

    // First step triggers output
    bar.onStep(100)
    const firstOutputCount = output.length

    // Second step too soon (less than 200ms)
    vi.advanceTimersByTime(100)
    bar.onStep(200)
    expect(output.length).toBe(firstOutputCount)

    // Third step after 200ms should trigger
    vi.advanceTimersByTime(150)
    bar.onStep(300)
    expect(output.length).toBeGreaterThan(firstOutputCount)

    vi.useRealTimers()
  })

  test('should handle step less than previous', () => {
    vi.useFakeTimers()
    const bar = new TextProgressBar(writer, 80)
    bar.onNum(1)
    bar.onName('test.txt')
    bar.onSize(1024)
    bar.onStep(512)
    vi.advanceTimersByTime(250)

    const outputCount = output.length
    bar.onStep(256) // Less than previous
    expect(output.length).toBe(outputCount) // Should not update

    vi.useRealTimers()
  })

  test('should handle long file names', () => {
    vi.useFakeTimers()
    const bar = new TextProgressBar(writer, 40) // Small terminal
    bar.onNum(1)
    bar.onName('this_is_a_very_long_file_name_that_should_be_truncated.txt')
    bar.onSize(1024)
    bar.onStep(512)

    expect(output.length).toBeGreaterThan(0)
    vi.useRealTimers()
  })

  test('should handle Chinese file names', () => {
    vi.useFakeTimers()
    const bar = new TextProgressBar(writer, 80)
    bar.onNum(1)
    bar.onName('中文文件名.txt')
    bar.onSize(1024)
    bar.onStep(512)

    expect(output.length).toBeGreaterThan(0)
    vi.useRealTimers()
  })
})
