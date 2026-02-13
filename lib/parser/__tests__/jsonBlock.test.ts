import { createJsonAccumulator, extractJsonBlock } from '../jsonBlock'

describe('jsonBlock', () => {
  it('extracts JSON when braces appear inside strings', () => {
    const message =
      'Generated packet: {"id":"chat-1","text":"brace { in text }","nested":{"ok":true}} trailing'

    const result = extractJsonBlock(message)

    expect(result.error).toBe(false)
    expect(result.raw).toContain('"brace { in text }"')
    expect(result.json).toEqual({
      id: 'chat-1',
      text: 'brace { in text }',
      nested: { ok: true },
    })
  })

  it('returns a non-throwing error state for truncated JSON', () => {
    const truncated =
      'Generated packet: {"id":"chat-1","choices":[{"delta":{"content":"hi"}}'

    const result = extractJsonBlock(truncated)

    expect(result.error).toBe(true)
    expect(result.raw).toContain('"id":"chat-1"')
    expect(result.json).toBeUndefined()
  })

  it('accumulates multiline JSON and parses when balanced', () => {
    const accumulator = createJsonAccumulator()

    const first = accumulator.accumulate('{"id":"chat-1",')
    const second = accumulator.accumulate(
      '"choices":[{"delta":{"content":"{ok}"}}]'
    )
    const third = accumulator.accumulate('}')

    expect(first.done).toBe(false)
    expect(second.done).toBe(false)
    expect(third.done).toBe(true)
    expect(third.json).toEqual({
      id: 'chat-1',
      choices: [{ delta: { content: '{ok}' } }],
    })
  })
})
