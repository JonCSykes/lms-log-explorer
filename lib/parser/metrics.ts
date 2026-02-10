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
  private updated = false

  /**
   * Update usage from packet
   */
  update(usage: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }): void {
    this.updated = true
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
   * Check if usage was updated in last call
   */
  isUpdated(): boolean {
    return this.updated
  }

  /**
   * Reset updated flag (call after checking)
   */
  resetUpdated(): void {
    this.updated = false
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
  private firstPromptProgressTs?: string
  private lastPromptProgressTs?: string
  private firstPacketTs?: string
  private lastPacketTs?: string
  private streamFinishedTs?: string

  /**
   * Record prompt progress timestamp
   */
  recordPromptProgress(ts: Timestamp): void {
    if (!this.firstPromptProgressTs || ts < this.firstPromptProgressTs) {
      this.firstPromptProgressTs = ts
    }

    if (!this.lastPromptProgressTs || ts > this.lastPromptProgressTs) {
      this.lastPromptProgressTs = ts
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
   * Record stream finished timestamp
   */
  recordStreamFinished(ts: Timestamp): void {
    if (!this.streamFinishedTs || ts > this.streamFinishedTs) {
      this.streamFinishedTs = ts
    }
  }

  /**
   * Compute prompt processing time
   */
  computePromptProcessingMs(): number | undefined {
    if (!this.firstPromptProgressTs || !this.lastPromptProgressTs) {
      return undefined
    }

    return computeDurationMs(this.firstPromptProgressTs, this.lastPromptProgressTs)
  }

  /**
   * Compute stream latency
   */
  computeStreamLatencyMs(): number | undefined {
    const streamEndTs = this.streamFinishedTs || this.lastPacketTs
    if (!this.firstPacketTs || !streamEndTs) {
      return undefined
    }

    return computeDurationMs(this.firstPacketTs, streamEndTs)
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
  // LM Studio formats:
  //   YYYY-MM-DD HH:MM:SS
  //   YYYY-MM-DD HH:MM:SS,mmm
  //   YYYY-MM-DD HH:MM:SS.mmm
  const match =
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:[,.](\d{1,3}))?$/.exec(
      ts
    )
  if (!match) {
    return Date.now()
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw, msRaw] =
    match
  if (
    !yearRaw ||
    !monthRaw ||
    !dayRaw ||
    !hourRaw ||
    !minuteRaw ||
    !secondRaw
  ) {
    return Date.now()
  }

  const year = Number.parseInt(yearRaw, 10)
  const month = Number.parseInt(monthRaw, 10)
  const day = Number.parseInt(dayRaw, 10)
  const hour = Number.parseInt(hourRaw, 10)
  const minute = Number.parseInt(minuteRaw, 10)
  const second = Number.parseInt(secondRaw, 10)
  const millisecond = msRaw ? Number.parseInt(msRaw.padEnd(3, '0'), 10) : 0

  return Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
}

function computeDurationMs(startTs: string, endTs: string): number | undefined {
  const startTime = parseTimestampMs(startTs)
  const endTime = parseTimestampMs(endTs)
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return undefined
  }

  return endTime - startTime
}
