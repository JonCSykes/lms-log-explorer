/**
 * Reconstruct assistant content from stream deltas
 */

export interface ContentChunk {
  ts: string
  content: string
}

/**
 * Reconstruct assistant response from content deltas
 */
export class ContentReconstructor {
  private chunks: ContentChunk[] = []

  /**
   * Add a content chunk
   */
  addChunk(ts: string, content?: string): void {
    if (content && content.length > 0) {
      this.chunks.push({ ts, content })
    }
  }

  /**
   * Get reconstructed content
   */
  getReconstructedContent(): string {
    return this.chunks.map((c) => c.content).join('')
  }

  /**
   * Get all chunks
   */
  getChunks(): ContentChunk[] {
    return [...this.chunks]
  }

  /**
   * Reset reconstruction
   */
  reset(): void {
    this.chunks = []
  }
}

/**
 * Assistant response with full content and timing
 */
export interface AssistantResponse {
  firstContentTs: string
  lastContentTs: string
  content: string
  chunks: ContentChunk[]
}

/**
 * Helper to build assistant response from stream events
 */
export function buildAssistantResponse(
  chunks: ContentChunk[]
): AssistantResponse {
  if (chunks.length === 0) {
    return {
      firstContentTs: '',
      lastContentTs: '',
      content: '',
      chunks,
    }
  }
  const firstChunk = chunks[0]
  const lastChunk = chunks[chunks.length - 1]
  if (!firstChunk || !lastChunk) {
    return {
      firstContentTs: '',
      lastContentTs: '',
      content: chunks.map((c) => c.content).join(''),
      chunks,
    }
  }

  return {
    firstContentTs: firstChunk.ts,
    lastContentTs: lastChunk.ts,
    content: chunks.map((c) => c.content).join(''),
    chunks,
  }
}
