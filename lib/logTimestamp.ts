const DATE_KEY_PREFIX_REGEX = /^(\d{4}-\d{2}-\d{2})(?:[ T]|$)/
const LMS_TIMESTAMP_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:[,.](\d{1,3}))?)?$/

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function extractDateKeyFromTimestamp(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const directMatch = DATE_KEY_PREFIX_REGEX.exec(trimmed)
  if (directMatch?.[1]) {
    return directMatch[1]
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return undefined
  }

  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`
}

export function parseLogTimestampMs(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const match = LMS_TIMESTAMP_REGEX.exec(trimmed)
  if (match) {
    const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw, msRaw] =
      match
    if (!yearRaw || !monthRaw || !dayRaw) {
      return undefined
    }

    const year = Number.parseInt(yearRaw, 10)
    const month = Number.parseInt(monthRaw, 10)
    const day = Number.parseInt(dayRaw, 10)
    const hour = Number.parseInt(hourRaw || '0', 10)
    const minute = Number.parseInt(minuteRaw || '0', 10)
    const second = Number.parseInt(secondRaw || '0', 10)
    const millisecond = msRaw ? Number.parseInt(msRaw.padEnd(3, '0'), 10) : 0

    return Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return undefined
  }

  return parsed.getTime()
}

export function compareLogTimestampsAsc(left: string, right: string): number {
  const leftTs = parseLogTimestampMs(left)
  const rightTs = parseLogTimestampMs(right)

  if (leftTs !== undefined && rightTs !== undefined) {
    return leftTs - rightTs
  }

  if (leftTs !== undefined) {
    return -1
  }

  if (rightTs !== undefined) {
    return 1
  }

  return left.localeCompare(right)
}
