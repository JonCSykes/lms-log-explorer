/**
 * @deprecated Session correlation is now handled by sequential session IDs. This module remains for backward compatibility with legacy code.
 */
import { type RequestReceivedEvent, type StreamPacketEvent } from './events'

/**
 * @deprecated Pending requests waiting for packet correlation. Session correlation now uses sequential session IDs.
 */
export interface PendingRequest {
  ts: string
  requestEvent: RequestReceivedEvent
}

/**
 * @deprecated Correlate a packet with its request. Session correlation now uses sequential session IDs.
 * Uses time-based heuristic since requests don't have chat IDs
 */
export function correlateRequestToPacket(
  pendingRequests: PendingRequest[],
  packetTs: string
): { requestEvent?: RequestReceivedEvent; matchedIndex: number } {
  const packetTime = parseTimestampToMs(packetTs)

  // Find the closest request within window (default: 5 seconds)
  const windowMs = 5000

  let closestDiff = Infinity
  let matchedIndex = -1

  for (let i = 0; i < pendingRequests.length; i++) {
    const pendingRequest = pendingRequests[i]
    if (!pendingRequest) {
      continue
    }
    const requestTime = parseTimestampToMs(pendingRequest.ts)
    const diff = Math.abs(packetTime - requestTime)

    if (diff <= windowMs && diff < closestDiff) {
      closestDiff = diff
      matchedIndex = i
    }
  }

  if (matchedIndex !== -1) {
    const matchedRequest = pendingRequests[matchedIndex]
    if (!matchedRequest) {
      return { matchedIndex: -1 }
    }
    return {
      requestEvent: matchedRequest.requestEvent,
      matchedIndex,
    }
  }

  return { matchedIndex: -1 }
}

/**
 * @deprecated Parse timestamp to milliseconds since epoch. Kept for backward compatibility.
 */
export function parseTimestampToMs(ts: string): number {
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

/**
 * @deprecated Session correlation result. Session correlation now uses sequential session IDs.
 */
export interface CorrelationResult {
  sessionchatId: string
  requestEvent?: RequestReceivedEvent
  packet: StreamPacketEvent
}

/**
 * @deprecated Link packets to requests and assign chat IDs. Session correlation now uses sequential session IDs.
 */
export class SessionLinker {
  private pendingRequests: PendingRequest[] = []

  /**
   * @deprecated Add a pending request for later correlation. Session correlation now uses sequential session IDs.
   */
  addRequest(request: RequestReceivedEvent): void {
    this.pendingRequests.push({
      ts: request.ts,
      requestEvent: request,
    })
  }

  /**
   * @deprecated Try to correlate a packet with a pending request. Session correlation now uses sequential session IDs.
   */
  linkPacket(packet: StreamPacketEvent): CorrelationResult {
    const { requestEvent, matchedIndex } = correlateRequestToPacket(
      this.pendingRequests,
      packet.ts
    )

    const packetData = packet.data as { packetId: string }
    const result: CorrelationResult = {
      sessionchatId: String(packetData.packetId || 'unknown'),
      packet,
    }

    if (requestEvent && matchedIndex !== -1) {
      result.requestEvent = requestEvent
      // Remove from pending since we matched
      this.pendingRequests.splice(matchedIndex, 1)
    }

    return result
  }
}
