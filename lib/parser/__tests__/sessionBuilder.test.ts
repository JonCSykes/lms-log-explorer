import * as fs from 'node:fs'
import * as path from 'node:path'

import { parseLogLine, readLogFileLines } from '../lineReader'
import { build, buildAsync } from '../sessionBuilder'

const fixturesRoot = path.join(process.cwd(), 'fixtures', '2024-01')

describe('sessionBuilder integration', () => {
  it('does not create sessions from orphan non-request events', () => {
    const lines = [
      '[2026-02-13 10:00:00][INFO] Prompt processing progress: 42%',
      '[2026-02-13 10:00:01][INFO] Generated packet: {"id":"chat-orphan","choices":[{"delta":{"content":"hello"}}]}',
      '[2026-02-13 10:00:02][INFO] Finished streaming response',
    ]
      .map((line) => parseLogLine(line))
      .filter((line): line is NonNullable<typeof line> => line !== null)

    const sessions = build(lines)

    expect(sessions).toHaveLength(0)
  })

  it('attaches same-timestamp pre-request events to the request session', () => {
    const lines = [
      '[2026-02-13 10:00:00][INFO] Prompt processing progress: 50%',
      '[2026-02-13 10:00:00][INFO] Generated packet: {"id":"chat-1","model":"qwen","choices":[{"delta":{"content":"hello"}}]}',
      '[2026-02-13 10:00:00][INFO] Received request: POST to /v1/chat/completions with body {"model":"qwen","messages":[{"role":"system","content":"You are Codex"},{"role":"user","content":"Hi"}]}',
      '[2026-02-13 10:00:01][INFO] Finished streaming response',
    ]
      .map((line) => parseLogLine(line))
      .filter((line): line is NonNullable<typeof line> => line !== null)

    const sessions = build(lines)

    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.request).toBeDefined()
    expect(sessions[0]?.events[0]?.type).toBe('request')
    expect(
      sessions[0]?.events.some((event) => event.type === 'prompt_processing')
    ).toBe(true)
    expect(
      sessions[0]?.events.some((event) => event.type === 'stream_chunk')
    ).toBe(true)
  })

  it('parses malformed fixture without crashing and keeps partial session data', async () => {
    const lines = await readLogFileLines(
      path.join(fixturesRoot, 'malformed-json.log')
    )

    const sessions = await buildAsync(lines)

    expect(sessions.length).toBeGreaterThan(0)
    const session = sessions[0]
    expect(session).toBeDefined()
    expect(session?.request).toBeDefined()
    expect(
      session?.events.some((event) => event.type === 'stream_finished')
    ).toBe(true)
  })

  it('computes stream latency from packets when stream_finished is missing', () => {
    const content = fs.readFileSync(
      path.join(fixturesRoot, 'simple-chat.log'),
      'utf-8'
    )

    const parsedLines = content
      .split('\n')
      .map((line) => parseLogLine(line))
      .filter((line): line is NonNullable<typeof line> => line !== null)
      .filter((line) => !line.message.startsWith('Finished streaming response'))

    const sessions = build(parsedLines)

    expect(sessions.length).toBeGreaterThan(0)
    expect(sessions[0]?.metrics.streamLatencyMs).toBeGreaterThan(0)
  })

  it('keeps request anchoring for interleaved sessions', async () => {
    const lines = await readLogFileLines(
      path.join(fixturesRoot, 'multiple-sessions.log')
    )

    const sessions = await buildAsync(lines)

    expect(sessions.length).toBe(2)
    for (const session of sessions) {
      expect(session.request).toBeDefined()
      expect(session.events[0]?.type).toBe('request')
    }
  })

  it('emits non-negative durations across fixtures', async () => {
    const fixtureFiles = fs
      .readdirSync(fixturesRoot)
      .filter((file) => file.endsWith('.log'))

    for (const fixtureFile of fixtureFiles) {
      const lines = await readLogFileLines(path.join(fixturesRoot, fixtureFile))
      const sessions = await buildAsync(lines)

      for (const session of sessions) {
        const promptProcessingMs = session.metrics.promptProcessingMs
        if (promptProcessingMs !== undefined) {
          expect(promptProcessingMs).toBeGreaterThanOrEqual(0)
        }

        const streamLatencyMs = session.metrics.streamLatencyMs
        if (streamLatencyMs !== undefined) {
          expect(streamLatencyMs).toBeGreaterThanOrEqual(0)
        }

        const streamResponseEvents = session.events.filter(
          (event) => event.type === 'stream_chunk'
        )

        for (const event of streamResponseEvents) {
          const elapsedMs = (event.data as { elapsedMs?: unknown }).elapsedMs
          if (typeof elapsedMs === 'number') {
            expect(elapsedMs).toBeGreaterThanOrEqual(0)
          }
        }
      }
    }
  })
})
