/**
 * Extract JSON block from message, handling multi-line JSON
 */
export function extractJsonBlock(message: string): {
  json?: object
  raw: string
  error?: boolean
} {
  const startIndex = message.indexOf('{')
  if (startIndex === -1) {
    return { raw: '', error: false }
  }

  let braceCount = 0
  let inString = false
  let escapeNext = false

  for (let i = startIndex; i < message.length; i++) {
    const char = message[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\') {
      escapeNext = true
      continue
    }

    if (char === '"' && !inString) {
      inString = true
      braceCount++
    } else if (char === '"' && inString) {
      inString = false
    } else if (!inString) {
      if (char === '{') {
        braceCount++
      } else if (char === '}') {
        braceCount--
        if (braceCount === 0) {
          const jsonStr = message.substring(startIndex, i + 1)
          try {
            return { json: JSON.parse(jsonStr), raw: jsonStr, error: false }
          } catch (e) {
            return { raw: jsonStr, error: true }
          }
        }
      }
    }
  }

  // Incomplete JSON - return what we have
  const jsonStr = message.substring(startIndex)
  return { raw: jsonStr, error: false }
}

/**
 * Try to parse JSON from message, return null if invalid
 */
export function tryParseJson(message: string): object | null {
  const jsonMatch = /\{[\s\S]*\}/.exec(message)
  if (!jsonMatch) {
    return null
  }

  try {
    return JSON.parse(jsonMatch[0])
  } catch (e) {
    return null
  }
}

/**
 * Accumulator interface for multiline JSON
 */
export interface JsonAccumulator {
  accumulate: (line: string) => { done: boolean; json?: object; raw: string }
}

export function createJsonAccumulator(): JsonAccumulator {
  let buffer = ''
  let braceCount = 0
  let inString = false
  let escapeNext = false

  function accumulate(line: string): {
    done: boolean
    json?: object
    raw: string
  } {
    buffer += `${line}\n`

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (escapeNext) {
        escapeNext = false
        continue
      }

      if (char === '\\') {
        escapeNext = true
        continue
      }

      if (char === '"' && !inString) {
        inString = true
      } else if (char === '"' && inString) {
        inString = false
      } else if (!inString) {
        if (char === '{') {
          braceCount++
        } else if (char === '}') {
          braceCount--
          if (braceCount === 0) {
            try {
              const json = JSON.parse(buffer.trim())
              return { done: true, json, raw: buffer.trim() }
            } catch (e) {
              return { done: true, raw: buffer.trim() }
            }
          }
        }
      }
    }

    return { done: false, raw: buffer.trim() }
  }

  return { accumulate }
}
