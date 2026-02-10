'use client'

import { cn } from '@/lib/utils'

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

interface JsonViewerProps {
  data: unknown
  className?: string
  maxHeightClassName?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item))
  }

  if (isRecord(value)) {
    const normalized: Record<string, JsonValue> = {}
    for (const [key, item] of Object.entries(value)) {
      normalized[key] = toJsonValue(item)
    }
    return normalized
  }

  return String(value)
}

function JsonPrimitive({ value }: { value: string | number | boolean | null }) {
  if (value === null) {
    return <span className="text-zinc-500">null</span>
  }

  if (typeof value === 'string') {
    return (
      <span className="text-emerald-700 dark:text-emerald-400">
        &quot;
        {value}
        &quot;
      </span>
    )
  }

  if (typeof value === 'number') {
    return <span className="text-sky-700 dark:text-sky-400">{value}</span>
  }

  return <span className="text-fuchsia-700 dark:text-fuchsia-400">{String(value)}</span>
}

function JsonNode({
  value,
  depth,
  name,
}: {
  value: JsonValue
  depth: number
  name?: string
}) {
  const keyLabel = name ? (
    <span className="text-amber-700 dark:text-amber-400">
      &quot;
      {name}
      &quot;
    </span>
  ) : null

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return (
      <div className="whitespace-pre-wrap break-words">
        {keyLabel ? (
          <>
            {keyLabel}: <JsonPrimitive value={value} />
          </>
        ) : (
          <JsonPrimitive value={value} />
        )}
      </div>
    )
  }

  if (Array.isArray(value)) {
    const summary = `[${value.length}]`
    return (
      <details open={depth < 1} className="group">
        <summary className="cursor-pointer list-none select-none">
          {keyLabel ? (
            <>
              {keyLabel}: <span className="text-muted-foreground">{summary}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{summary}</span>
          )}
        </summary>
        <div className="mt-1 border-l border-border pl-4">
          {value.length === 0 ? (
            <span className="text-muted-foreground">[]</span>
          ) : (
            value.map((item) => (
              <JsonNode
                key={`${name || 'array'}-${JSON.stringify(item)}`}
                value={item}
                depth={depth + 1}
              />
            ))
          )}
        </div>
      </details>
    )
  }

  const entries = Object.entries(value)
  const summary = `{${entries.length}}`
  return (
    <details open={depth < 1} className="group">
      <summary className="cursor-pointer list-none select-none">
        {keyLabel ? (
          <>
            {keyLabel}: <span className="text-muted-foreground">{summary}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{summary}</span>
        )}
      </summary>
      <div className="mt-1 border-l border-border pl-4">
        {entries.length === 0 ? (
          <span className="text-muted-foreground">{'{}'}</span>
        ) : (
          entries.map(([key, item]) => (
            <JsonNode key={`${name || 'obj'}-${key}`} name={key} value={item} depth={depth + 1} />
          ))
        )}
      </div>
    </details>
  )
}

export default function JsonViewer({
  data,
  className,
  maxHeightClassName = 'max-h-[24rem]',
}: JsonViewerProps) {
  const normalized = toJsonValue(data)
  return (
    <div
      className={cn(
        'max-w-full overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs',
        maxHeightClassName,
        className
      )}
    >
      <JsonNode value={normalized} depth={0} />
    </div>
  )
}
