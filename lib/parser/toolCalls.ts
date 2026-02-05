import { ToolCallDelta } from './events';

/**
 * Aggregated tool call across multiple deltas
 */
export interface AggregatedToolCall {
  id: string;
  name?: string;
  argumentsText: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

/**
 * Parse tool call arguments as JSON if possible
 */
export function parseToolCallArguments(text: string): Record<string, unknown> | null {
  if (!text.trim()) {
    return null;
  }
  
  try {
    return JSON.parse(text);
  } catch (e) {
    // Partial or invalid JSON
    return null;
  }
}

/**
 * Tool call merger for accumulating partial arguments across deltas
 */
export class ToolCallMerger {
  private toolCalls: Map<string, AggregatedToolCall> = new Map();
  
  /**
   * Add a tool call delta
   */
  addDelta(delta: ToolCallDelta, ts: string): void {
    const existing = this.toolCalls.get(delta.id);
    
    if (existing) {
      // Update existing
      existing.argumentsText += delta.function.arguments || '';
      if (delta.function.name) {
        existing.name = delta.function.name;
      }
      existing.lastSeenAt = ts;
    } else {
      // New tool call
      this.toolCalls.set(delta.id, {
        id: delta.id,
        name: delta.function.name,
        argumentsText: delta.function.arguments || '',
        firstSeenAt: ts,
        lastSeenAt: ts,
      });
    }
  }
  
  /**
   * Get all aggregated tool calls
   */
  getToolCalls(): AggregatedToolCall[] {
    return Array.from(this.toolCalls.values());
  }
  
  /**
   * Get tool call by ID
   */
  getToolCall(id: string): AggregatedToolCall | undefined {
    return this.toolCalls.get(id);
  }
  
  /**
   * Clear all tool calls
   */
  clear(): void {
    this.toolCalls.clear();
  }
}
