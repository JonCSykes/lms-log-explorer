export function formatDurationMs(
  value: number | undefined,
  unknownLabel: string = 'Unknown'
): string {
  if (value === undefined || !Number.isFinite(value)) {
    return unknownLabel
  }

  const ms = Math.max(0, value)
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }

  const totalSeconds = ms / 1000
  if (totalSeconds > 60) {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds - minutes * 60
    return `${minutes}m ${seconds.toFixed(2)}s`
  }

  return `${totalSeconds.toFixed(2)}s`
}
