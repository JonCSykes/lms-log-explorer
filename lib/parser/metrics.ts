import { type Timestamp } from '../../types/types'

/**
 * Session metrics computed from parsed events
 */
export interface SessionMetrics {
  /**
   * Number of prompt tokens consumed
   */
  promptTokens?: number

  /**
   * Number of completion tokens generated
   */
  completionTokens?: number

  /**
   * Total tokens (prompt + completion)
   */
  totalTokens?: number

  /**
   * Time spent processing prompt (ms)
   */
  promptProcessingMs?: number

  /**
   * Stream duration (ms)
   */
  streamLatencyMs?: number

  /**
   * Tokens per second (completionTokens / streamLatencySeconds)
   */
  tokensPerSecond?: number
}

/**
 * Track usage information from stream
 */
export class UsageTracker {
  private promptTokens?: number
  private completionTokens?: number
  private totalTokens?: number

  /**
   * Update usage from packet
   */
  update(usage: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }): void {
    if (usage.prompt_tokens !== undefined) {
      this.promptTokens = usage.prompt_tokens
    }
    if (usage.completion_tokens !== undefined) {
      this.completionTokens = usage.completion_tokens
    }
    if (usage.total_tokens !== undefined) {
      this.totalTokens = usage.total_tokens
    }
  }

  /**
   * Get computed metrics
   */
  getMetrics(): SessionMetrics {
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
    }
  }
}

/**
 * Track timing information for stages
 */
export class TimingTracker {
  private promptProgressTs?: string
  private firstPacketTs?: string
  private lastPacketTs?: string

  /**
   * Record prompt progress timestamp
   */
  recordPromptProgress(ts: Timestamp): void {
    if (!this.promptProgressTs || ts < this.promptProgressTs) {
      this.promptProgressTs = ts
    }
  }

  /**
   * Record first packet timestamp
   */
  recordFirstPacket(ts: Timestamp): void {
    if (!this.firstPacketTs || ts < this.firstPacketTs) {
      this.firstPacketTs = ts
    }
  }

  /**
   * Record last packet timestamp
   */
  recordLastPacket(ts: Timestamp): void {
    if (!this.lastPacketTs || ts > this.lastPacketTs) {
      this.lastPacketTs = ts
    }
  }

  /**
   * Compute prompt processing time
   */
  computePromptProcessingMs(): number | undefined {
    if (!this.promptProgressTs || !this.firstPacketTs) {
      return undefined
    }

    const startTime = parseTimestampMs(this.promptProgressTs)
    const endTime = parseTimestampMs(this.firstPacketTs)

    return endTime - startTime
  }

  /**
   * Compute stream latency
   */
  computeStreamLatencyMs(): number | undefined {
    if (!this.firstPacketTs || !this.lastPacketTs) {
      return undefined
    }

    const startTime = parseTimestampMs(this.firstPacketTs)
    const endTime = parseTimestampMs(this.lastPacketTs)

    return endTime - startTime
  }

  /**
   * Compute tokens per second
   */
  computeTokensPerSecond(tokens: number | undefined): number | undefined {
    const latency = this.computeStreamLatencyMs()
    if (latency === undefined || latency <= 0 || !tokens) {
      return undefined
    }

    // Convert ms to seconds
    const latencySeconds = latency / 1000
    return tokens / latencySeconds
  }
}

/**
 * Parse timestamp to milliseconds since epoch
 */
export function parseTimestampMs(ts: string): number {
  // LM Studio format: YYYY-MM-DD HH:MM:SS
  const [date, time] = ts.split(' ')
  if (!date || !time) {
    return Date.now()
  }

  const dateParts = date.split('-').map(Number)
  const timeParts = time.split(':').map(Number)
  const year = dateParts[0]
  const month = dateParts[1]
  const day = dateParts[2]
  const hour = timeParts[0]
  const minute = timeParts[1]
  const second = timeParts[2]

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    return Date.now()
  }

  return Date.UTC(year, month - 1, day, hour, minute, second)
}
