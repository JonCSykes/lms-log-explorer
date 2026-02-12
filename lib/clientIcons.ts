import { type ClientType } from '@/types'

const CLIENT_ICONS: Record<Exclude<ClientType, 'Unknown'>, string> = {
  Opencode: '/images/opencode.svg',
  Codex: '/images/codex.svg',
  Claude: '/images/claude.svg',
}

export function getClientIcon(client: ClientType): string | undefined {
  if (client === 'Unknown') {
    return undefined
  }

  return CLIENT_ICONS[client]
}
