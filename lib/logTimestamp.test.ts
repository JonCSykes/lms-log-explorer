import {
  compareLogTimestampsAsc,
  extractDateKeyFromTimestamp,
  parseLogTimestampMs,
} from './logTimestamp'

describe('logTimestamp', () => {
  it('extracts date key directly from LM Studio timestamp without UTC conversion', () => {
    expect(extractDateKeyFromTimestamp('2026-02-09 23:58:59')).toBe(
      '2026-02-09'
    )
    expect(extractDateKeyFromTimestamp('2026-02-09T23:58:59')).toBe(
      '2026-02-09'
    )
  })

  it('parses LM timestamps with millisecond comma separators', () => {
    const ts = parseLogTimestampMs('2026-02-09 23:58:59,7')
    const expected = Date.UTC(2026, 1, 9, 23, 58, 59, 700)
    expect(ts).toBe(expected)
  })

  it('compares LM timestamps in chronological order', () => {
    expect(
      compareLogTimestampsAsc('2026-02-09 23:59:59', '2026-02-10 00:00:00')
    ).toBeLessThan(0)
    expect(
      compareLogTimestampsAsc('2026-02-10 00:00:00', '2026-02-09 23:59:59')
    ).toBeGreaterThan(0)
  })
})
