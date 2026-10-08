import { realpathSync } from 'node:fs'
import { register } from 'node:module'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import { Validator } from '@cfworker/json-schema'
import { publicationManifest as manifest, pageRoute, schemaRoute } from './publication-manifest.js'

export type ObjectValue = Record<string, unknown>
export type MarkdownNode = {
  type: string; depth?: number; value?: string; lang?: string; url?: string; identifier?: string
  children?: MarkdownNode[]; position?: { start: { offset?: number }; end: { offset?: number } }
}
export const object = (value: unknown): ObjectValue => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object')
  return value as ObjectValue
}
export const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')
export const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n'
export const markdownTree = (value: string): MarkdownNode => unified().use(remarkParse).use(remarkGfm).use(remarkMdx).parse(value) as MarkdownNode
export function walk(node: MarkdownNode, visit: (node: MarkdownNode) => void): void {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}
export function selectGuide(source: string, selection: { source?: string; section?: string; depth?: number }): string {
  if (!selection.section) return source
  const nodes = (unified().use(remarkParse).use(remarkGfm).parse(source) as MarkdownNode).children ?? []
  const headingText = (node: MarkdownNode): string => {
    let text = ''; walk(node, child => { if (child.value) text += child.value }); return text
  }
  const starts = nodes.filter(node => node.type === 'heading' && node.depth === selection.depth && headingText(node) === selection.section)
  if (starts.length !== 1) throw new Error(`Section must occur exactly once: ${selection.section}`)
  const start = starts[0]!
  const index = nodes.indexOf(start)
  const end = nodes.slice(index + 1).find(node => node.type === 'heading' && node.depth! <= start.depth!)
  return source.slice(start.position!.start.offset!, end?.position?.start.offset).trimEnd() + '\n'
}
export function pageContent(body: string, fallbackTitle: string): string {
  const first = markdownTree(body).children?.[0]
  const title = fallbackTitle
  if (first?.type === 'heading' && first.position?.start.offset === 0) {
    body = body.slice(first.position.end.offset!).replace(/^\n+/, '')
  }
  return `---\ntitle: ${JSON.stringify(title)}\n---\n\n${body}`
}
export function qualifyMarkdown(body: string, source: string, routes: Set<string>, rewrite = false): string {
  const mappings: Record<string, string> = (manifest.linkMappings as Record<string, Record<string, string>>)[source] ?? {}
  const edits: { start: number; end: number; text: string }[] = []
  walk(markdownTree(body), node => {
    if (node.type.startsWith('mdx') || node.type === 'html' || node.type === 'image' || node.type === 'imageReference') {
      throw new Error(`Executable MDX, HTML, includes and assets are not approved: ${source}:${node.type}`)
    }
    if (node.type === 'linkReference') throw new Error(`Reference links require explicit qualification: ${source}`)
    if (node.type !== 'link' && node.type !== 'definition') return
    const original = node.url!
    const target = mappings[original] ?? original
    if (!routes.has(target.split('#')[0]!) && !(manifest.externalLinks as readonly string[]).includes(target) && !manifest.referencePublication.unsupported.some(entry => target === `/openapi.json${operationPointer({ ...entry, operation: {}, output: '' })}`) && !target.startsWith('#')) {
      throw new Error(`Unlisted link: ${source}: ${original}`)
    }
    if (target !== original && rewrite) {
      const start = node.position!.start.offset!; const end = node.position!.end.offset!
      const originalNode = body.slice(start, end)
      // Replace this AST-confirmed destination only; preserve all prose and code verbatim.
      const at = originalNode.lastIndexOf(original)
      if (at < 0) throw new Error(`Cannot map link without changing authored text: ${original}`)
      edits.push({ start: start + at, end: start + at + original.length, text: target })
    }
  })
  for (const edit of edits.sort((a, b) => b.start - a.start)) body = body.slice(0, edit.start) + edit.text + body.slice(edit.end)
  return body
}
export function scopedReference(raw: ObjectValue): { document: ObjectValue; schemas: string[]; operation: ObjectValue } {
  const checkLocal = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(checkLocal); return }
    const record = object(value)
    if ('$ref' in record && (typeof record.$ref !== 'string' || !record.$ref.startsWith('#/'))) throw new Error(`External OpenAPI reference: ${String(record.$ref)}`)
    Object.values(record).forEach(checkLocal)
  }
  checkLocal(raw)
  const paths = object(raw.paths)
  const path = object(paths[manifest.reference.path])
  const operation = object(path[manifest.reference.method])
  if (operation.operationId !== manifest.reference.operationId) throw new Error('Approved operation identity changed')
  const components = object(raw.components); const available = object(components.schemas)
  const names = new Set<string>()
  const scan = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(scan); return }
    const record = object(value)
    if ('$ref' in record) {
      const ref = record.$ref
      if (typeof ref !== 'string' || !ref.startsWith('#/components/schemas/')) throw new Error(`External or unsupported ref: ${String(ref)}`)
      const name = ref.slice('#/components/schemas/'.length)
      if (!/^[A-Za-z0-9_]+$/.test(name) || !(name in available)) throw new Error(`Unresolved schema: ${ref}`)
      if (!names.has(name)) { names.add(name); scan(available[name]) }
    }
    Object.values(record).forEach(scan)
  }
  scan(operation)
  if (names.size !== manifest.reference.schemaCount) throw new Error(`Reference schema closure changed: ${names.size}`)
  const schemas = [...names].sort()
  const schemes = object(components.securitySchemes)
  const securityNames = new Set((operation.security as ObjectValue[] ?? []).flatMap(entry => Object.keys(entry)))
  const selectedSchemes = Object.fromEntries([...securityNames].map(name => {
    if (!(name in schemes)) throw new Error(`Unknown security scheme: ${name}`)
    return [name, schemes[name]]
  }))
  return {
    operation, schemas,
    document: { ...raw, paths: { [manifest.reference.path]: { [manifest.reference.method]: operation } }, components: { schemas: Object.fromEntries(schemas.map(name => [name, available[name]])), securitySchemes: selectedSchemes } },
  }
}
export function explicitExamples(raw: ObjectValue, operation: ObjectValue, schemas: string[]): Map<string, { schema: unknown; values: unknown[] }[]> {
  const entries = new Map<string, { schema: unknown; values: unknown[] }[]>()
  const media = (container: unknown): { schema: unknown; values: unknown[] }[] => Object.values(object(object(container).content)).map(value => {
    const item = object(value)
    const values = item.examples ? Object.values(object(item.examples)).map(example => {
      const entry = object(example)
      if (!('value' in entry) || 'externalValue' in entry) throw new Error('External or missing media example')
      return entry.value
    }) : 'example' in item ? [item.example] : []
    if (!values.length) throw new Error('Every published media type requires owner-authored examples')
    return { schema: item.schema, values }
  })
  entries.set('reference/tool-call.md', [
    ...media(operation.requestBody),
    ...Object.values(object(operation.responses)).flatMap(response => media(response)),
  ])
  const available = object(object(raw.components).schemas)
  for (const name of schemas) {
    const schema = object(available[name]); const values = schema.examples as unknown[] | undefined
    if (!Array.isArray(values) || !values.length) throw new Error(`Owner-authored model examples required: ${name}`)
    entries.set(`reference/schemas/${name}.md`, [{ schema, values }])
  }
  for (const [page, groups] of entries) for (const group of groups) for (const value of group.values) {
    const schema = { ...object(group.schema), components: raw.components }
    const validator = new Validator(schema, '2020-12', false)
    const result = validator.validate(value)
    if (!result.valid) throw new Error(`Invalid owner example: ${page}: ${JSON.stringify(result.errors)}`)
  }
  return entries
}
type ReferenceMethod = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace'
export type ReferenceOperation = { path: string; method: ReferenceMethod; operation: ObjectValue; output: string; reason?: string }
export const operationPointer = (entry: ReferenceOperation): string => '#/paths/' + entry.path.replaceAll('~', '~0').replaceAll('/', '~1') + '/' + entry.method
export const operationOutput = (id: string): string => id === manifest.reference.operationId ? 'reference/tool-call.md' : `reference/operations/${id.replaceAll('.', '-').replaceAll('_', '-')}.md`
function dereference(raw: ObjectValue, value: unknown): ObjectValue {
  const record = object(value)
  if (typeof record.$ref !== 'string') return record
  if (!record.$ref.startsWith('#/')) throw new Error(`External reference: ${record.$ref}`)
  let selected: unknown = raw
  for (const part of decodeURIComponent(record.$ref.slice(2)).split('/')) selected = object(selected)[part.replaceAll('~1', '/').replaceAll('~0', '~')]
  return object(selected)
}
export function validateArtifactLink(raw: ObjectValue, url: string): void {
  if (!url.startsWith('/openapi.json#')) throw new Error(`Unapproved OpenAPI artifact pointer: ${url}`)
  // HTML encodes braces in URI fragments; compare the decoded JSON Pointer,
  // then retain the same exact operation allowlist and identity check.
  const pointer = decodeURIComponent(url.slice('/openapi.json'.length))
  const entry = manifest.referencePublication.unsupported.find(candidate => pointer === operationPointer({ ...candidate, operation: {}, output: '' }))
  if (!entry) throw new Error(`Unapproved OpenAPI artifact pointer: ${url}`)
  const operation = dereference(raw, { $ref: url.slice('/openapi.json'.length) })
  if (operation.operationId !== entry.operationId) throw new Error(`OpenAPI artifact pointer identity changed: ${url}`)
}
export function referencePublication(raw: ObjectValue): { operations: ReferenceOperation[]; schemas: string[]; document: ObjectValue } {
  const available = object(object(raw.components).schemas)
  const methods: ReferenceMethod[] = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']
  const operations: ReferenceOperation[] = []
  const ids = new Set<string>(); const outputs = new Set<string>()
  for (const [path, item] of Object.entries(object(raw.paths))) for (const method of methods) {
    const candidate = object(item)[method]
    if (!candidate) continue
    const operation = object(candidate); const id = operation.operationId
    if (typeof id !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(id) || ids.has(id)) throw new Error(`Ambiguous operation ID: ${String(id)}`)
    const output = operationOutput(id)
    if (outputs.has(output)) throw new Error(`Ambiguous operation output: ${output}`)
    ids.add(id); outputs.add(output)
    const excluded = manifest.referencePublication.unsupported.find(entry => entry.operationId === id)
    if (excluded && (excluded.path !== path || excluded.method !== method)) throw new Error(`Excluded operation identity changed: ${id}`)
    operations.push({ path, method, operation, output, ...(excluded ? { reason: excluded.reason } : {}) })
  }
  if (operations.length !== manifest.referencePublication.operationCount || operations.filter(entry => !entry.reason).length !== manifest.referencePublication.renderedOperationCount) throw new Error('Publication operation count changed')
  for (const entry of manifest.referencePublication.unsupported) if (!ids.has(entry.operationId)) throw new Error(`Excluded operation missing: ${entry.operationId}`)
  const closure = (value: unknown, names = new Set<string>(), seen = new Set<string>()): Set<string> => {
    if (!value || typeof value !== 'object') return names
    if (Array.isArray(value)) { value.forEach(entry => closure(entry, names, seen)); return names }
    const record = object(value)
    if ('$ref' in record) {
      if (typeof record.$ref !== 'string') throw new Error('Malformed reference')
      const target = dereference(raw, record)
      if (record.$ref.startsWith('#/components/schemas/')) {
        const name = record.$ref.slice('#/components/schemas/'.length)
        if (!/^[A-Za-z0-9_]+$/.test(name) || !(name in available)) throw new Error(`Unsupported schema name: ${name}`)
        names.add(name)
      }
      if (!seen.has(record.$ref)) { seen.add(record.$ref); closure(target, names, seen) }
    }
    Object.values(record).forEach(entry => closure(entry, names, seen))
    return names
  }
  // Validate every owner reference, including excluded operations and unused components.
  closure(raw)
  const names = new Set<string>()
  for (const entry of operations.filter(entry => !entry.reason)) {
    const item = object(object(raw.paths)[entry.path])
    closure({ parameters: item.parameters, servers: item.servers, ...entry.operation }, names)
    const requirements = (entry.operation.security ?? raw.security ?? []) as ObjectValue[]
    for (const requirement of requirements) for (const name of Object.keys(requirement)) {
      if (!(name in object(object(raw.components).securitySchemes))) throw new Error(`Unknown security scheme: ${name}`)
    }
  }
  const schemas = [...names].sort()
  if (schemas.length !== manifest.referencePublication.schemaCount) throw new Error(`Published schema closure changed: ${schemas.length}`)
  for (const name of schemas) inspectSchema(available[name], () => {})
  return { operations, schemas, document: raw }
}
const supportedSchemaKeywords = new Set(['$ref', 'type', 'properties', 'required', 'additionalProperties', 'items', 'allOf', 'anyOf', 'oneOf', 'enum', 'const', 'default', 'description', 'format', 'examples', 'example', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'propertyNames', 'prefixItems'])
export function inspectSchema(schema: unknown, visit: (schema: ObjectValue) => void): void {
  if (typeof schema === 'boolean') return
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error(`Invalid schema node: ${JSON.stringify(schema)}`)
  const value = object(schema)
  for (const keyword of Object.keys(value)) if (!supportedSchemaKeywords.has(keyword)) throw new Error(`Unqualified schema keyword: ${keyword}`)
  if (Array.isArray(value.prefixItems) && value.prefixItems.length) throw new Error('Pinned Scalar drops positional tuple item constraints')
  if (Array.isArray(value.items) && value.items.length) throw new Error('Pinned Scalar drops array-valued items tuple constraints')
  if (value.propertyNames && json(value.propertyNames) !== json({ type: 'string' })) throw new Error('Pinned Scalar drops material propertyNames constraints')
  visit(value)
  for (const child of Object.values(object(value.properties ?? {}))) inspectSchema(child, visit)
  for (const key of ['items', 'additionalProperties']) if (value[key] && typeof value[key] === 'object' && !Array.isArray(value[key])) inspectSchema(value[key], visit)
  for (const key of ['allOf', 'anyOf', 'oneOf']) for (const child of (value[key] ?? []) as unknown[]) inspectSchema(child, visit)
}
export function verifySchemaFidelity(schema: unknown, body: string, label: string): void {
  const codes = new Set<string>(); const text: string[] = []; const pairs = new Set<string>()
  // Check literal keyword/value adjacency in the existing Markdown AST. This is a
  // bounded presence check: identical constraints on different nested fields are
  // not independently associated with their source paths. Raw OpenAPI owns them.
  const markers = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'format', 'const', 'default', 'possible values']
  walk(markdownTree(body), node => {
    if (node.type === 'inlineCode') codes.add(node.value!)
    if (node.value && node.type !== 'code') text.push(node.value)
    const children = node.children ?? []
    for (let index = 1; index < children.length; index += 1) {
      const previous = children[index - 1]!; const current = children[index]!
      if (previous.type !== 'text' || current.type !== 'inlineCode') continue
      for (const marker of markers) if (new RegExp('(?:^|[\\s,])' + marker + ':\\s*$').test(previous.value ?? '')) pairs.add(marker + '\0' + current.value)
    }
  })
  const visible = text.join(' ')
  const requireCode = (value: string, keyword: string): void => {
    const marker = keyword === 'enum' ? 'possible values' : keyword
    if (!pairs.has(marker + '\0' + value)) throw new Error(`Missing ${keyword}/value pair: ${label}: ${value}`)
  }
  inspectSchema(schema, value => {
    for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'format']) if (key in value) requireCode(String(value[key]), key)
    if ('const' in value) requireCode(JSON.stringify(value.const), 'const')
    if ('default' in value) requireCode(JSON.stringify(value.default), 'default')
    if (Array.isArray(value.enum)) requireCode(value.enum.map(entry => JSON.stringify(entry)).join(', '), 'enum')
    if (value.additionalProperties === false && !visible.includes('no additional properties')) throw new Error(`Missing closed object: ${label}`)
    for (const name of (value.required ?? []) as string[]) if (!visible.includes(`${name}  (required)`) && !visible.includes(`${name} (required)`)) throw new Error(`Missing required field: ${label}: ${name}`)
    for (const type of [value.type ?? []].flat() as string[]) if (!(type === 'array' && visible.includes('array of ')) && ![...codes].some(code => code.split(/ \| |array of |[()]/).includes(type))) throw new Error(`Missing type: ${label}: ${type}`)
    for (const [key, marker] of [['allOf', 'All of:'], ['anyOf', 'Any of:'], ['oneOf', 'One of:']] as const) {
      const branches = value[key] as ObjectValue[] | undefined
      if (!branches || branches.length < 2) continue
      const simple = branches.every(branch => Object.keys(branch).every(name => ['type', '$ref'].includes(name))) || (branches.length === 2 && branches.some(branch => branch.type === 'null'))
      if (!simple && !visible.includes(marker)) throw new Error(`Missing composition: ${label}: ${key}`)
    }
  })
}

export function referenceIndex(operations: ReferenceOperation[]): string {
  return '# API reference\n\n' + manifest.referencePublication.notice + '\n\n| Operation | HTTP contract | Read-only declaration | Reference |\n| --- | --- | --- | --- |\n' + operations.map(entry =>
    `| \`${String(entry.operation.operationId)}\` | \`${entry.method.toUpperCase()} ${entry.path}\` | ${String(entry.operation['x-ae-read-only'] ?? 'unspecified')} | ${entry.reason ? `[Complete OpenAPI contract](/openapi.json${operationPointer(entry)}) — ${entry.reason}` : `[${String(entry.operation.summary ?? entry.operation.operationId)}](${pageRoute(entry.output)})`} |`,
  ).join('\n') + '\n'
}
export function referenceFallback(entry: ReferenceOperation, raw: ObjectValue): string {
  const requirements = (entry.operation.security ?? raw.security ?? []) as ObjectValue[]
  const schemes = object(object(raw.components).securitySchemes)
  const authentication = requirements.length ? requirements.map(requirement => {
    const names = Object.keys(requirement)
    if (!names.length) return 'No authentication required'
    return names.map(name => {
      if (!(name in schemes)) throw new Error(`Unknown security scheme: ${name}`)
      const scheme = object(schemes[name])
      const scopes = requirement[name] as string[]
      return `\`${name}\` (${String(scheme.type)}${scheme.scheme ? ` ${String(scheme.scheme)}` : ''})${scopes.length ? `; scopes: ${scopes.join(', ')}` : ''}${scheme.description ? ` — ${String(scheme.description)}` : ''}`
    }).join(' AND ')
  }).join(' OR ') : 'No authentication required'
  return `# ${String(entry.operation.summary ?? entry.operation.operationId)}

\`${entry.method.toUpperCase()} ${entry.path}\`

Operation: \`${String(entry.operation.operationId)}\`.

Authentication: ${authentication}.

${entry.reason}

[Complete OpenAPI contract](/openapi.json${operationPointer(entry)})

The link opens this build's unchanged OpenAPI JSON. Its fragment is a JSON Pointer, not a page heading; a browser JSON viewer may not jump to it. Find \`${entry.path}\` under \`paths\`, then \`${entry.method}\`. Read \`requestBody\`, \`responses\` and \`security\` together. Resolve each \`$ref\` from the same document root; for example, \`#/components/schemas/Name\` selects \`Name\` under \`components.schemas\`. Keep the full document when saving it so these references remain resolvable.
`
}
export function sanitizeModelExample(schema: ObjectValue, body: string): string {
  if ('example' in schema || (Array.isArray(schema.examples) && schema.examples.length)) return body
  const tree = markdownTree(body)
  const nodes = tree.children ?? []
  const jsonNodes: MarkdownNode[] = []
  walk(tree, node => { if (node.type === 'code' && node.lang === 'json') jsonNodes.push(node) })
  if (!jsonNodes.length) return body
  const label = nodes.at(-2); const code = nodes.at(-1)
  // Pinned Scalar's selected object model appends exactly this generated pair.
  // Refuse descriptions/nested examples/changed upstream structure rather than guessing.
  if (schema.type !== 'object' || jsonNodes.length !== 1 || code !== jsonNodes[0] || label?.type !== 'paragraph' || label.children?.length !== 1 || label.children[0]?.type !== 'strong' || label.children[0].children?.length !== 1 || label.children[0].children[0]?.value !== 'Example:') throw new Error('Ambiguous generated model example')
  return body.slice(0, label.position!.start.offset!).trimEnd() + '\n'
}
export function authoredExamples(raw: ObjectValue, operations: ReferenceOperation[], schemas: string[]): Map<string, { schema: unknown; values: unknown[] }[]> {
  const entries = new Map<string, { schema: unknown; values: unknown[] }[]>()
  const examples = (value: ObjectValue): unknown[] => {
    if ('example' in value) return [value.example]
    if (value.examples) return Array.isArray(value.examples) ? value.examples : Object.values(object(value.examples)).map(entry => {
      const example = dereference(raw, entry)
      if (!('value' in example) || 'externalValue' in example) throw new Error('Nonlocal owner example')
      return example.value
    })
    return []
  }
  const media = (container: unknown): { schema: unknown; values: unknown[] }[] => {
    if (!container) return []
    return Object.values(object(dereference(raw, container).content ?? {})).map(item => {
      const record = object(item); const own = examples(record)
      return { schema: record.schema, values: own.length ? own : record.schema ? examples(dereference(raw, record.schema)) : [] }
    })
  }
  for (const entry of operations.filter(entry => !entry.reason)) entries.set(entry.output, [
    ...media(entry.operation.requestBody), ...Object.values(object(entry.operation.responses)).flatMap(media),
    ...((entry.operation.parameters ?? []) as unknown[]).flatMap(parameter => {
      const record = dereference(raw, parameter)
      return record.schema ? [{ schema: record.schema, values: examples(record) }] : media(record)
    }),
  ])
  const available = object(object(raw.components).schemas)
  for (const name of schemas) { const schema = object(available[name]); entries.set(`reference/schemas/${name}.md`, [{ schema, values: examples(schema) }]) }
  for (const [page, groups] of entries) for (const group of groups) for (const value of group.values) {
    if (!group.schema) throw new Error(`Owner example has no schema: ${page}`)
    const result = new Validator({ ...object(group.schema), components: raw.components }, '2020-12', false).validate(value)
    if (!result.valid) throw new Error(`Invalid owner example: ${page}: ${JSON.stringify(result.errors)}`)
  }
  return entries
}

export async function readSource(repo: string, relative: string): Promise<Buffer> {
  const segments = relative.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) throw new Error(`Invalid source path: ${relative}`)
  let current = repo
  for (const segment of segments) {
    current = join(current, segment)
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Source symlink is not approved: ${relative}`)
  }
  return readFile(current)
}
export async function snapshot(repo: string): Promise<{ head: string; sources: Record<string, string>; dirtySources: Record<string, string> }> {
  const sourcePaths = ['src', 'packages/cli/README.md', 'docs/glossary.md', 'docs/foundations.md', 'docs/operations/deployments.md', 'plugins/agentic-economy', 'tools/docs', 'package.json', 'package-lock.json', '.nvmrc', 'tsconfig.json', 'tsconfig.arc.json', 'packages/docs']
  const paths = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...sourcePaths], { cwd: repo }).toString().split('\0').filter(Boolean).filter((path, index, all) => all.indexOf(path) === index).sort()
  const changed = new Set([...execFileSync('git', ['diff', '--name-only', '-z', 'HEAD'], { cwd: repo }).toString().split('\0'), ...execFileSync('git', ['ls-files', '-z', '--others', '--exclude-standard'], { cwd: repo }).toString().split('\0')])
  const deleted = new Set(execFileSync('git', ['diff', '--diff-filter=D', '--name-only', '-z', 'HEAD', '--', ...sourcePaths], { cwd: repo }).toString().split('\0').filter(Boolean))
  const reads = await Promise.all(paths.map(async path => {
    try { return [path, digest(await readSource(repo, path))] as const }
    catch (cause) {
      // Tracked deletions are part of a dirty candidate, not missing publication inputs.
      // An unexpected missing file or a source symlink still fails the snapshot.
      if (deleted.has(path) && typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT') return undefined
      throw cause
    }
  }))
  const sources = Object.fromEntries(reads.filter((read): read is readonly [string, string] => read !== undefined))
  return {
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo }).toString().trim(), sources,
    dirtySources: Object.fromEntries([...Object.entries(sources).filter(([path]) => changed.has(path)), ...[...deleted].filter(path => !Object.hasOwn(sources, path)).sort().map(path => [path, 'deleted'] as const)]),
  }
}
export async function filesUnder(directory: string): Promise<string[]> {
  const rootEntry = await lstat(directory).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
  if (rootEntry?.isSymbolicLink()) throw new Error(`Publication directory symlink: ${directory}`)
  const result: string[] = []
  async function visit(path: string, prefix = ''): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error })) {
      const relative = prefix + entry.name
      if (entry.isSymbolicLink()) throw new Error(`Symlink not permitted in publication: ${relative}`)
      if (entry.isDirectory()) await visit(join(path, entry.name), relative + '/')
      else if (entry.isFile()) result.push(relative)
      else throw new Error(`Unsupported publication file: ${relative}`)
    }
  }
  await visit(directory); return result.sort()
}
async function renderFrozen(input: string, output: string): Promise<void> {
  globalThis.fetch = async () => { throw new Error('Documentation rendering is offline') }
  const { createOpenApiMarkdownRenderer } = await import('@scalar/openapi-to-markdown')
  const scoped = object(JSON.parse(await readFile(input, 'utf8')))
  scopedReference(scoped)
  const { schemas, operations } = referencePublication(scoped)
  const renderer = await createOpenApiMarkdownRenderer(scoped)
  const schemaReferences = { mode: 'linked' as const, resolveUrl: ({ name }: { name: string }) => schemas.includes(name) ? schemaRoute(name) : undefined }
  await mkdir(join(output, 'reference/schemas'), { recursive: true })
  await mkdir(join(output, 'reference/operations'), { recursive: true })
  await writeFile(join(output, 'reference/index.md'), referenceIndex(operations))
  for (const entry of operations) await writeFile(join(output, entry.output), entry.reason ? referenceFallback(entry, scoped) : await renderer.render({ operation: { path: entry.path, method: entry.method }, schemaReferences }))
  const available = object(object(scoped.components).schemas)
  for (const name of schemas) await writeFile(join(output, `reference/schemas/${name}.md`), sanitizeModelExample(object(available[name]), await renderer.render({ model: name, schemaReferences })))
}
export async function installedPins(): Promise<Record<string, string>> {
  const actual: Record<string, string> = {}
  for (const [name, expected] of Object.entries(manifest.pins)) {
    let directory = dirname(fileURLToPath(import.meta.resolve(name)))
    for (;;) {
      const pkg = await readFile(join(directory, 'package.json'), 'utf8').then(text => object(JSON.parse(text))).catch(() => undefined)
      if (pkg?.name === name) {
        if (pkg.version !== expected) throw new Error(`Unqualified dependency version: ${name}: ${String(pkg.version)}`)
        actual[name] = String(pkg.version); break
      }
      const parent = dirname(directory)
      if (parent === directory) throw new Error(`Package provenance unavailable: ${name}`)
      directory = parent
    }
  }
  return actual
}
export async function ownerDocument(repo: string): Promise<ObjectValue> {
  // The owner facade includes Vite's exact canonical SKILL.md?raw import.
  // Reproduce that one raw-module import in Node; do not support arbitrary includes.
  const rawUrl = pathToFileURL(join(repo, manifest.artifactSources['SKILL.md'])).href + '?raw'
  const loader = `import { readFile } from 'node:fs/promises';
export async function load(url, context, next) {
  if (url === ${JSON.stringify(rawUrl)}) return { format: 'module', shortCircuit: true, source: 'export default ' + JSON.stringify(await readFile(new URL(url), 'utf8')) };
  return next(url, context);
}`
  register('data:text/javascript;base64,' + Buffer.from(loader).toString('base64'), import.meta.url)
  const facade = await import(pathToFileURL(join(repo, 'src/modules/discovery/public.ts')).href)
  return object(facade.buildOpenApiDocument({ canonicalBaseUrl: manifest.canonicalOrigin }))
}
export async function exportDocs(repo: string, output: string): Promise<void> {
  globalThis.fetch = async () => { throw new Error('Documentation export is offline') }
  const pins = await installedPins()
  const before = await snapshot(repo)
  const raw = await ownerDocument(repo)
  const qualified = scopedReference(raw)
  explicitExamples(raw, qualified.operation, qualified.schemas)
  const { document, schemas, operations } = referencePublication(raw)
  authoredExamples(raw, operations, schemas)
  const routes = new Set([...manifest.guides.map(guide => pageRoute(guide.output)), pageRoute('reference/index.md'), ...operations.map(entry => pageRoute(entry.output)), ...schemas.map(schemaRoute)])
  const content = new Map<string, string>()
  for (const guide of manifest.guides) {
    const selected = selectGuide((await readSource(repo, guide.source)).toString('utf8'), guide)
    content.set(guide.output, qualifyMarkdown(selected, guide.source, routes, true))
  }
  const temp = await mkdtemp(join(tmpdir(), 'aecon-docs-export-'))
  try {
    await writeFile(join(temp, 'reference.json'), json(document))
    const rendered = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--render', join(temp, 'reference.json'), join(temp, 'content')], { cwd: repo, timeout: 30_000, encoding: 'utf8', env: { ...process.env, DO_NOT_TRACK: '1' } })
    if (rendered.error || rendered.status !== 0) throw new Error(`Scalar failed: ${rendered.error?.message ?? rendered.stderr}`)
    for (const path of await filesUnder(join(temp, 'content'))) content.set(path, qualifyMarkdown(await readFile(join(temp, 'content', path), 'utf8'), path, routes))
    const artifactContents = new Map<string, string>([['openapi.json', json(raw)]])
    for (const [outputName, source] of Object.entries(manifest.artifactSources)) artifactContents.set(outputName, (await readSource(repo, source)).toString('utf8'))
    const after = await snapshot(repo)
    if (json(before) !== json(after)) throw new Error('Source changed while exporting; retry from one stable source snapshot')
    const expectedContent = [...content.keys(), ...Object.keys(manifest.navigation)].sort()
    const previousContent = await filesUnder(join(output, 'content/docs'))
    const previousArtifacts = await filesUnder(join(output, 'public'))
    if (previousArtifacts.some(path => !['openapi.json', 'SKILL.md', 'docs-manifest.json', 'docs-provenance.json'].includes(path))) throw new Error('Unapproved existing public artifact; remove it deliberately before export')
    if (previousContent.some(path => !expectedContent.includes(path))) throw new Error('Unapproved existing docs content; remove it deliberately before export')
    const ledger: Record<string, string> = {}
    for (const [path, body] of content) {
      const title = manifest.guides.find(guide => guide.output === path)?.title ?? (path === 'reference/index.md' ? 'API reference' : String(operations.find(entry => entry.output === path)?.operation.summary ?? path.split('/').at(-1)!.slice(0, -3)))
      const value = pageContent(body, title)
      const target = join(output, 'content/docs', path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, value)
      ledger[`content/docs/${path}`] = digest(value)
    }
    for (const [path, metadata] of Object.entries(manifest.navigation)) {
      const value = json(metadata)
      const target = join(output, 'content/docs', path)
      await mkdir(dirname(target), { recursive: true }); await writeFile(target, value)
      ledger[`content/docs/${path}`] = digest(value)
    }
    await mkdir(join(output, 'public'), { recursive: true })
    for (const [path, body] of artifactContents) { await writeFile(join(output, 'public', path), body); ledger[`public/${path}`] = digest(body) }
    await writeFile(join(output, 'public/docs-manifest.json'), json({ version: manifest.version, routes: [...routes].sort(), files: ledger }))
    await writeFile(join(output, 'public/docs-provenance.json'), json({
      version: manifest.version, head: before.head, sourceSnapshotDigest: digest(json(before.sources)),
      dirtySourcesDigest: digest(json(before.dirtySources)), dirty: Object.keys(before.dirtySources).length > 0, selectedSources: Object.fromEntries(manifest.guides.map(guide => [guide.source, before.sources[guide.source]])),
      contractDigest: digest(json(raw)), contractVersion: object(raw.info).version,
      lockDigests: { root: before.sources['package-lock.json'], docs: before.sources['packages/docs/package-lock.json'] },
      pins, manifestDigest: digest(json(manifest)), schemaClosure: schemas,
      operationCoverage: operations.map(entry => ({ operationId: entry.operation.operationId, path: entry.path, method: entry.method, disposition: entry.reason ? 'raw-openapi' : 'rendered', ...(entry.reason ? { reason: entry.reason } : {}) })),
      exampleSanitation: 'Scalar 1.5.2 generates root object model examples even in linked mode. Remove only its final Example+JSON AST pair when the source has no root example/examples; refuse ambiguous output.',
      rendererNormalization: 'Scalar 1.5.2 internally normalizes a clone to OpenAPI 3.2.0; raw owner OpenAPI is unchanged.',
    }))
    console.info(`Exported ${content.size} allowlisted docs pages from ${before.head}`)
  } finally { await rm(temp, { recursive: true, force: true }) }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--render') await renderFrozen(process.argv[3]!, process.argv[4]!)
  else await exportDocs(resolve(process.argv[2] ?? '.'), resolve(process.argv[3] ?? 'packages/docs'))
}
