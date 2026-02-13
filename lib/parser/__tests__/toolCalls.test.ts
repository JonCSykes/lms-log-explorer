import { ToolCallMerger, parseToolCallArguments } from '../toolCalls'

describe('toolCalls', () => {
  it('merges partial arguments using id + index fallback', () => {
    const merger = new ToolCallMerger()

    merger.addDelta(
      {
        id: 'tool-123',
        index: 0,
        function: { name: 'glob', arguments: '{"pattern":"' },
      },
      '2024-01-15 11:00:01'
    )

    merger.addDelta(
      {
        index: 0,
        function: { arguments: '**/*.ts"}' },
      },
      '2024-01-15 11:00:02'
    )

    const [toolCall] = merger.getToolCalls()
    expect(toolCall).toBeDefined()
    expect(toolCall?.id).toBe('tool-123')
    expect(toolCall?.name).toBe('glob')
    expect(toolCall?.argumentsText).toBe('{"pattern":"**/*.ts"}')
    expect(parseToolCallArguments(toolCall?.argumentsText || '')).toEqual({
      pattern: '**/*.ts',
    })
  })

  it('uses single-call fallback when id is absent', () => {
    const merger = new ToolCallMerger()

    merger.addDelta(
      {
        id: 'tool-xyz',
        function: { name: 'echo', arguments: '{"value":"a' },
      },
      '2024-01-15 11:00:01'
    )

    merger.addDelta(
      {
        function: { arguments: 'bc"}' },
      },
      '2024-01-15 11:00:02'
    )

    const [toolCall] = merger.getToolCalls()
    expect(toolCall?.argumentsText).toBe('{"value":"abc"}')
  })

  it('returns null for invalid JSON argument text', () => {
    expect(parseToolCallArguments('{"broken"')).toBeNull()
    expect(parseToolCallArguments('')).toBeNull()
  })
})
