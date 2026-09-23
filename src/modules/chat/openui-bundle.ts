import { CHAT_TOOL_IDS, type ChatToolId, type ToolCardProjection } from '@/modules/chat/tool-card'

const FENCE_OPEN = '```openui'
const FENCE_CLOSE = '```'

const TOOL_ROLES = {
  choices: ['registry.tools.search', 'registry.tools.list'],
  compare: ['registry.tools.compare'],
  facts: ['registry.tools.describe', 'tool.quote'],
  call: ['tool.call'],
  status: [
    'registry.tools.search',
    'registry.tools.list',
    'registry.tools.describe',
    'registry.tools.compare',
    'tool.quote',
    'tool.call',
  ],
} as const satisfies Record<string, readonly ChatToolId[]>

type ToolRole = keyof typeof TOOL_ROLES

type Expr =
  | { readonly type: 'stack'; readonly names: readonly string[] }
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool'; readonly role: ToolRole; readonly toolId: ChatToolId }

export type BoundOpenUiNode =
  | { readonly kind: 'stack'; readonly children: readonly BoundOpenUiNode[] }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'tool'; readonly toolIndex: number }

export type OpenUiBundle =
  | { readonly prose: string; readonly root: BoundOpenUiNode; readonly consumed: ReadonlySet<number> }
  | { readonly prose: string; readonly root: null }

function isChatToolId(value: string): value is ChatToolId {
  return (CHAT_TOOL_IDS as readonly string[]).includes(value)
}

function readQuoted(source: string): string | null {
  if (!source.startsWith('"')) return null
  let text = ''
  for (let index = 1; index < source.length; index += 1) {
    const char = source[index]
    if (char === '\\') {
      const next = source[index + 1]
      if (next === undefined) return null
      text += next
      index += 1
      continue
    }
    if (char === '"') return source.slice(index + 1) === '' ? text : null
    text += char
  }
  return null
}

function parseExpr(source: string): Expr | null {
  const open = source.indexOf('(')
  const close = source.endsWith(')') ? source.length - 1 : -1
  if (open < 1 || close < open) return null
  const name = source.slice(0, open)
  const args = source.slice(open + 1, close).trim()
  if (name === 'Stack') {
    if (!args.startsWith('[') || !args.endsWith(']')) return null
    const names = args.slice(1, -1).split(',').map((part) => part.trim()).filter((part) => part.length > 0)
    if (names.length === 0 || names.some((part) => !/^[A-Za-z][A-Za-z0-9]*$/u.test(part))) return null
    return { type: 'stack', names }
  }
  if (name === 'TextContent') {
    const text = readQuoted(args)
    return text === null || text.trim().length === 0 ? null : { type: 'text', text }
  }
  const role = componentRole(name)
  if (role === null) return null
  const toolId = readQuoted(args)
  if (toolId === null || !isChatToolId(toolId)) return null
  if (!(TOOL_ROLES[role] as readonly string[]).includes(toolId)) return null
  return { type: 'tool', role, toolId }
}

function componentRole(name: string): ToolRole | null {
  switch (name) {
    case 'ToolChoices':
      return 'choices'
    case 'ToolCompare':
      return 'compare'
    case 'ToolFacts':
      return 'facts'
    case 'CallRecord':
      return 'call'
    case 'StatusCallout':
      return 'status'
    default:
      return null
  }
}

function resolveNode(
  name: string,
  env: ReadonlyMap<string, Expr>,
  trail: readonly string[],
): { readonly kind: 'stack'; readonly names: readonly string[] } | { readonly kind: 'text'; readonly text: string } | { readonly kind: 'tool'; readonly role: ToolRole; readonly toolId: ChatToolId } | null {
  if (trail.includes(name)) return null
  const expr = env.get(name)
  if (expr === undefined) return null
  if (expr.type === 'text') return { kind: 'text', text: expr.text }
  if (expr.type === 'tool') return { kind: 'tool', role: expr.role, toolId: expr.toolId }
  return { kind: 'stack', names: expr.names }
}

function bindNode(
  name: string,
  env: ReadonlyMap<string, Expr>,
  tools: readonly ToolCardProjection[],
  used: Set<number>,
  trail: readonly string[],
): BoundOpenUiNode | null {
  const resolved = resolveNode(name, env, trail)
  if (resolved === null) return null
  if (resolved.kind === 'text') return resolved
  if (resolved.kind === 'tool') {
    const toolIndex = tools.findIndex((tool, index) => !used.has(index) && toolMatches(tool, resolved.role, resolved.toolId))
    if (toolIndex < 0) return null
    used.add(toolIndex)
    return { kind: 'tool', toolIndex }
  }
  const children: BoundOpenUiNode[] = []
  for (const child of resolved.names) {
    const bound = bindNode(child, env, tools, used, [...trail, name])
    if (bound !== null) children.push(bound)
  }
  return children.length === 0 ? null : { kind: 'stack', children }
}

function toolMatches(tool: ToolCardProjection, role: ToolRole, toolId: ChatToolId): boolean {
  if (tool.toolId !== toolId) return false
  switch (role) {
    case 'choices':
    case 'compare':
      return tool.kind === 'choices'
    case 'facts':
      return tool.kind === 'inspect'
    case 'call':
      return tool.kind === 'execute'
    case 'status':
      return tool.kind === 'status'
    default: {
      const exhaustive: never = role
      return exhaustive
    }
  }
}

function parseEnv(body: string): Map<string, Expr> | null {
  const env = new Map<string, Expr>()
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const match = /^([A-Za-z][A-Za-z0-9]*)\s*=\s*(.+)$/u.exec(trimmed)
    if (match === null) return null
    const name = match[1]
    const exprSource = match[2]
    if (name === undefined || exprSource === undefined || env.has(name)) return null
    const expr = parseExpr(exprSource.trim())
    if (expr === null) return null
    env.set(name, expr)
  }
  return env.size === 0 ? null : env
}

export function readOpenUiBundle(text: string, tools: readonly ToolCardProjection[]): OpenUiBundle | null {
  const openAt = text.indexOf(FENCE_OPEN)
  if (openAt < 0) return null
  const prose = text.slice(0, openAt).trim()
  const afterOpen = text.slice(openAt + FENCE_OPEN.length)
  const closeAt = afterOpen.indexOf(FENCE_CLOSE)
  if (closeAt < 0) return { prose, root: null }
  const env = parseEnv(afterOpen.slice(0, closeAt))
  if (env === null || !env.has('root')) return null
  const used = new Set<number>()
  const root = bindNode('root', env, tools, used, [])
  if (root === null) return null
  return { prose, root, consumed: used }
}
