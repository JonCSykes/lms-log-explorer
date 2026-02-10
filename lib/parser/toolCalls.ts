import { type ToolCallDelta } from './events'

/**
 * Aggregated tool call across multiple deltas
 */
export interface AggregatedToolCall {
  id: string
  name?: string
  argumentsText: string
  firstSeenAt: string
  lastSeenAt: string
}

/**
 * Parse tool call arguments as JSON if possible
 */
export function parseToolCallArguments(
  text: string
): Record<string, unknown> | null {
  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch (e) {
    // Partial or invalid JSON
    return null
  }
}

/**
 * Tool call merger for accumulating partial arguments across deltas
 */
export class ToolCallMerger {
  private toolCalls: Map<string, AggregatedToolCall> = new Map()
  private indexToId: Map<number, string> = new Map()

  private resolveToolCallId(delta: ToolCallDelta): string | null {
    if (delta.id && delta.id.trim().length > 0) {
      if (typeof delta.index === 'number') {
        this.indexToId.set(delta.index, delta.id)
      }
      return delta.id
    }

    if (typeof delta.index === 'number') {
      const mappedId = this.indexToId.get(delta.index)
      if (mappedId) {
        return mappedId
      }
    }

    // Best-effort fallback for streams where only one call is active.
    if (this.toolCalls.size === 1) {
      const [onlyToolCallId] = this.toolCalls.keys()
      if (onlyToolCallId) {
        return onlyToolCallId
      }
    }

    return null
  }

  /**
   * Add a tool call delta
   */
  addDelta(delta: ToolCallDelta, ts: string): void {
    const toolCallId = this.resolveToolCallId(delta)
    if (!toolCallId) {
      return
    }

    const existing = this.toolCalls.get(toolCallId)

    if (existing) {
      // Update existing - append arguments in order
      const argText = delta.function.arguments || ''
      if (argText) {
        existing.argumentsText += argText
      }
      if (delta.function.name) {
        existing.name = delta.function.name
      }
      existing.lastSeenAt = ts
    } else {
      // New tool call
      const argText = delta.function.arguments || ''
      this.toolCalls.set(toolCallId, {
        id: toolCallId,
        name: delta.function.name,
        argumentsText: argText,
        firstSeenAt: ts,
        lastSeenAt: ts,
      })
    }
  }

  /**
   * Get all aggregated tool calls
   */
  getToolCalls(): AggregatedToolCall[] {
    return Array.from(this.toolCalls.values())
  }

  /**
   * Get tool call by ID
   */
  getToolCall(id: string): AggregatedToolCall | undefined {
    return this.toolCalls.get(id)
  }

  /**
   * Clear all tool calls
   */
  clear(): void {
    this.toolCalls.clear()
    this.indexToId.clear()
  }
}
