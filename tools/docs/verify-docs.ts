import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'parse5'
import GithubSlugger from 'github-slugger'
import { publicationManifest as manifest, pageRoute, schemaRoute } from './publication-manifest.js'
import type { ObjectValue } from './export-docs.js'
import { digest, explicitExamples, filesUnder, json, markdownTree, object, qualifyMarkdown, scopedReference, selectGuide, snapshot, walk, ownerDocument, installedPins, pageContent, readSource, referencePublication, authoredExamples, referenceIndex, verifySchemaFidelity, referenceFallback, validateArtifactLink } from './export-docs.js'

const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message) }
const stripFrontmatter = (body: string): string => {
  assert(body.startsWith('---\ntitle: '), 'Generated page frontmatter missing')
  const end = body.indexOf('\n---\n\n', 4)
  assert(end > 0, 'Generated page frontmatter malformed')
  return body.slice(end + 6)
}
export async function verifyDocs(repo: string, output: string, emitted?: string): Promise<void> {
  globalThis.fetch = async () => { throw new Error('Documentation verification is offline') }
  await installedPins()
  const before = await snapshot(repo)
  const rawBytes = await readFile(join(output, 'public/openapi.json'), 'utf8')
  const raw = object(JSON.parse(rawBytes))
  assert(rawBytes === json(await ownerDocument(repo)), 'Raw OpenAPI differs from current owner output')
  const qualified = scopedReference(raw)
  const { schemas, operations } = referencePublication(raw)
  const routes = new Set([...manifest.guides.map(guide => pageRoute(guide.output)), pageRoute('reference/index.md'), ...operations.map(entry => pageRoute(entry.output)), ...schemas.map(schemaRoute)])
  const expectedPages = [...manifest.guides.map(guide => guide.output), 'reference/index.md', ...operations.map(entry => entry.output), ...schemas.map(name => `reference/schemas/${name}.md`)].sort()
  const expectedContent = [...expectedPages, ...Object.keys(manifest.navigation)].sort()
  assert(json(await filesUnder(join(output, 'content/docs'))) === json(expectedContent), 'Content collection differs from explicit allowlist')
  for (const [path, metadata] of Object.entries(manifest.navigation)) {
    assert(await readFile(join(output, 'content/docs', path), 'utf8') === json(metadata), `Page-tree metadata differs: ${path}`)
  }
  const expectedArtifacts = ['SKILL.md', 'docs-manifest.json', 'docs-provenance.json', 'openapi.json'].sort()
  assert(json(await filesUnder(join(output, 'public'))) === json(expectedArtifacts), 'Public assets differ from explicit allowlist')
  const metadata = object(JSON.parse(await readFile(join(output, 'public/docs-manifest.json'), 'utf8')))
  assert(metadata.version === manifest.version && json(metadata.routes) === json([...routes].sort()), 'Route manifest changed')
  const expectedLedgerFiles = [...expectedContent.map(path => `content/docs/${path}`), 'public/SKILL.md', 'public/openapi.json'].sort()
  const ledger = object(metadata.files)
  assert(json(Object.keys(ledger).sort()) === json(expectedLedgerFiles), 'Artifact ledger differs from allowlist')
  for (const path of expectedLedgerFiles) assert(digest(await readFile(join(output, path))) === ledger[path], `Artifact digest changed: ${path}`)
  const bodies = new Map<string, string>()
  for (const path of expectedPages) {
    const body = stripFrontmatter(await readFile(join(output, 'content/docs', path), 'utf8'))
    assert(qualifyMarkdown(body, path, routes) === body, `Unapproved markup: ${path}`)
    assert(!body.includes('Circular Reference') && !body.includes('Generated example'), `Scalar fallback: ${path}`)
    bodies.set(path, body)
  }
  const anchors = new Map<string, Set<string>>()
  for (const [path, body] of bodies) {
    const slugger = new GithubSlugger(); const ids = new Set<string>()
    walk(markdownTree(body), node => {
      if (node.type !== 'heading') return
      let text = ''; walk(node, child => { if (child.value) text += child.value })
      ids.add(slugger.slug(text))
    })
    anchors.set(pageRoute(path), ids)
  }
  for (const [path, body] of bodies) walk(markdownTree(body), node => {
    if (node.type !== 'link' || !node.url?.includes('#') || node.url.includes('://')) return
    if (node.url.startsWith('/openapi.json#')) { validateArtifactLink(raw, node.url); return }
    const [target, anchor] = node.url.split('#')
    assert(anchors.get(target || pageRoute(path))?.has(decodeURIComponent(anchor!)), `Unresolved heading anchor: ${path}: ${node.url}`)
  })
  for (const guide of manifest.guides) {
    const selected = selectGuide((await readSource(repo, guide.source)).toString('utf8'), guide)
    assert(await readFile(join(output, 'content/docs', guide.output), 'utf8') === pageContent(qualifyMarkdown(selected, guide.source, routes, true), guide.title), `Maintained guide differs: ${guide.source}`)
  }
  for (const [path, source] of Object.entries(manifest.artifactSources)) {
    const body = await readFile(join(output, 'public', path), 'utf8')
    assert(body === (await readSource(repo, source)).toString('utf8'), `Canonical artifact differs: ${path}`)
    qualifyMarkdown(body, source, routes)
  }
  let exampleCount = 0
  for (const [path, groups] of explicitExamples(raw, qualified.operation, qualified.schemas)) {
    const rendered: unknown[] = []
    walk(markdownTree(bodies.get(path)!), node => { if (node.type === 'code' && node.lang === 'json') rendered.push(JSON.parse(node.value!)) })
    const expected = groups.flatMap(group => group.values)
    assert(json(rendered) === json(expected), `Rendered examples differ from owner values: ${path}`)
    exampleCount += rendered.length
  }
  assert(bodies.get('reference/index.md') === stripFrontmatter(pageContent(referenceIndex(operations), 'API reference')), 'Operation dispositions differ from owner/manifest')
  for (const entry of operations.filter(entry => entry.reason)) assert(bodies.get(entry.output) === stripFrontmatter(pageContent(referenceFallback(entry, raw), String(entry.operation.summary ?? entry.operation.operationId))), `Fallback contract changed: ${entry.output}`)
  exampleCount = 0
  for (const [path, groups] of authoredExamples(raw, operations, schemas)) {
    const rendered: unknown[] = []
    walk(markdownTree(bodies.get(path)!), node => { if (node.type === 'code' && node.lang === 'json') rendered.push(JSON.parse(node.value!)) })
    exampleCount += rendered.length
    const expected = new Set(groups.flatMap(group => group.values).map(value => json(value)))
    const actual = new Set(rendered.map(value => json(value)))
    assert(json([...actual].sort()) === json([...expected].sort()), `Unowned or missing example: ${path}`)
  }
  const availableSchemas = object(object(raw.components).schemas)
  for (const name of schemas) verifySchemaFidelity(availableSchemas[name], bodies.get(`reference/schemas/${name}.md`)!, name)
  for (const entry of operations.filter(entry => !entry.reason)) {
    const body = bodies.get(entry.output)!
    const values: string[] = []
    walk(markdownTree(body), node => { if (node.value && node.type !== 'code') values.push(node.value) })
    const text = values.join(' ')
    assert(text.includes(entry.path) && text.includes(entry.method.toUpperCase()) && text.includes(String(entry.operation.operationId)), `Operation identity missing: ${entry.output}`)
    for (const status of Object.keys(object(entry.operation.responses))) assert(values.includes(status) || values.some(value => value.startsWith(status + ' ') || value.split(', ').includes(status)), `Response status missing: ${entry.output}: ${status}`)
    const item = object(object(raw.paths)[entry.path])
    const parameters = new Map<string, ObjectValue>()
    for (const parameter of [...(item.parameters ?? []) as ObjectValue[], ...(entry.operation.parameters ?? []) as ObjectValue[]]) parameters.set(`${String(parameter.in)}:${String(parameter.name)}`, parameter)
    for (const parameter of parameters.values()) {
      const sections: Record<string, string> = { path: 'Path parameters', query: 'Query parameters', header: 'Header parameters', cookie: 'Cookie parameters' }
      const sectionName = sections[String(parameter.in)]
      if (sectionName === undefined) throw new Error(`Unqualified parameter location: ${entry.output}: ${String(parameter.in)}`)
      const section = selectGuide(body, { section: sectionName, depth: 2 })
      const matches: { body: string; required: boolean }[] = []
      walk(markdownTree(section), node => {
        if (node.type !== 'listItem') return
        const paragraph = node.children?.[0]
        const label = paragraph?.children?.[0]
        if (paragraph?.type !== 'paragraph' || label?.type !== 'strong') return
        const name = label.children?.find(child => child.type === 'inlineCode')?.value
        if (name !== String(parameter.name)) return
        const required = label.children?.some(child => child.type === 'text' && child.value?.includes('(required)')) ?? false
        matches.push({ body: section.slice(node.position!.start.offset!, node.position!.end.offset!), required })
      })
      assert(matches.length === 1, `Effective parameter missing or ambiguous: ${entry.output}: ${String(parameter.name)}`)
      const rendered = matches[0]!
      assert(rendered.required === (parameter.required === true), `Required parameter marker differs: ${entry.output}: ${String(parameter.name)}`)
      if (parameter.schema) verifySchemaFidelity(parameter.schema, rendered.body, `${String(entry.operation.operationId)}:${String(parameter.name)}`)
    }
    const security = (entry.operation.security ?? raw.security ?? []) as ObjectValue[]
    const authentication = selectGuide(body, { section: 'Authentication', depth: 2 })
    const authenticationNames = new Set<string>()
    walk(markdownTree(authentication), node => {
      if (node.type !== 'strong') return
      let name = ''; walk(node, child => { if (child.value) name += child.value })
      authenticationNames.add(name)
    })
    for (const requirement of security) for (const name of Object.keys(requirement)) assert(authenticationNames.has(name), `Effective security missing: ${entry.output}: ${name}`)
    if (!security.length) assert(authentication.includes('No authentication required.'), `Anonymous contract missing: ${entry.output}`)
  }
  const call = bodies.get('reference/tool-call.md')!
  const response = bodies.get('reference/schemas/ToolCallResponse.md')!
  const request = bodies.get('reference/schemas/ToolCallRequest.md')!
  const money = bodies.get('reference/schemas/ToolCallResponseExactAmount.md')!
  const receipt = bodies.get('reference/schemas/ToolCallResponseCallReceipt.md')!
  const recursive = bodies.get('reference/schemas/ToolCallResponseSchema0.md')!
  const callText: string[] = []
  walk(markdownTree(call), node => { if (node.value) callText.push(node.value) })
  assert(['HTTP bearer', 'market_tools:call', 'application/problem+json', '400', '401', '403', '409', '413', '415', '429', '500', '503'].every(value => callText.join(' ').includes(value)), 'Call authentication/error contract missing')
  assert(['minLength: `8`', 'maxLength: `200`', '^operation-commitment:v1:[0-9a-f]{64}$'].every(value => request.includes(value)), 'Request bounds missing')
  assert(['completed', 'pending', 'outcome_unknown', 'refused', 'contentExpiredAt', 'retention policy', 'reconcile_before_retry', 'call.status', 'args', 'ownerHandoff', 'account_owner', 'authority_required', 'destination', '/agent-access', 'no additional properties'].every(value => response.includes(value)), 'Response branch/retention contract missing')
  assert(['^[A-Z][A-Z0-9]{2,19}$', '^(0|[1-9]\\d*)$', 'minimum: `0`', 'maximum: `18`'].every(value => money.includes(value)), 'Exact money constraints missing')
  assert(['managed_x402', 'payoutEligible', 'false', 'eip155:8453', 'eip155:84532'].every(value => receipt.includes(value)), 'Receipt obligation/settlement contract missing')
  const selfLinks: string[] = []
  walk(markdownTree(recursive), node => { if (node.type === 'link' && node.url === schemaRoute('ToolCallResponseSchema0')) selfLinks.push(node.url) })
  assert(selfLinks.length === 2, 'Recursive model lost named array/object links')
  const provenance = object(JSON.parse(await readFile(join(output, 'public/docs-provenance.json'), 'utf8')))
  assert(provenance.head === before.head && provenance.sourceSnapshotDigest === digest(json(before.sources)), 'Source snapshot changed since export')
  assert(provenance.dirtySourcesDigest === digest(json(before.dirtySources)) && provenance.dirty === (Object.keys(before.dirtySources).length > 0), 'Dirty source identity changed')
  assert(json(provenance.lockDigests) === json({ root: before.sources['package-lock.json'], docs: before.sources['packages/docs/package-lock.json'] }), 'Dependency lock provenance changed')
  assert(provenance.contractDigest === digest(rawBytes) && provenance.contractVersion === object(raw.info).version, 'Contract provenance changed')
  assert(provenance.manifestDigest === digest(json(manifest)) && json(provenance.pins) === json(manifest.pins), 'Publication policy/pins changed')
  assert(json(provenance.schemaClosure) === json(schemas), 'Schema closure provenance changed')
  assert(json(provenance.operationCoverage) === json(operations.map(entry => ({ operationId: entry.operation.operationId, path: entry.path, method: entry.method, disposition: entry.reason ? 'raw-openapi' : 'rendered', ...(entry.reason ? { reason: entry.reason } : {}) }))), 'Operation coverage provenance changed')
  if (emitted) await verifyEmitted(emitted, output, routes)
  assert(json(before) === json(await snapshot(repo)), 'Source changed during verification')
  console.info(`Verified ${expectedPages.length} docs pages and ${exampleCount} owner examples${emitted ? ', including emitted HTML/resources' : ''}`)
}

type HtmlNode = { nodeName: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: HtmlNode[] }
export async function verifyEmitted(emitted: string, output: string, routes: Set<string>): Promise<void> {
  const files = await filesUnder(emitted)
  const raw = object(JSON.parse(await readFile(join(output, 'public/openapi.json'), 'utf8')))
  const publicArtifacts = new Set(['openapi.json', 'SKILL.md', 'docs-manifest.json', 'docs-provenance.json', 'llms.txt', 'llms-full.txt'])
  const approvedMarkdown = new Set([...routes].map(route => route === '/docs' ? 'docs/index.md' : route.slice(1) + '.md'))
  const approvedHtml = new Set(['index.html', '404.html', ...[...routes].flatMap(route => [route.slice(1) + '.html', route.slice(1) + '/index.html'])])
  for (const path of files) {
    assert(publicArtifacts.has(path) || approvedMarkdown.has(path) || approvedHtml.has(path) || /^assets\/[A-Za-z0-9_.-]+\.(?:js|css|woff2?|ttf)$/.test(path), `Unapproved emitted file (including source maps): ${path}`)
  }
  const htmlFiles = files.filter(path => path.endsWith('.html'))
  assert(htmlFiles.length > 0, 'No emitted static HTML available; runtime route/browser qualification remains required')
  const htmlRoutes = new Set(htmlFiles.map(path => '/' + path.replace(/(?:\/index)?\.html$/, '').replace(/^index$/, '')))
  for (const route of routes) assert(htmlRoutes.has(route), `Approved human page was not emitted: ${route}`)
  for (const route of htmlRoutes) assert(routes.has(route) || ['/', '/404', '/_not-found'].includes(route), `Unlisted HTML route emitted: ${route}`)
  const walkHtml = (node: HtmlNode, visit: (node: HtmlNode) => void): void => { visit(node); node.childNodes?.forEach(child => walkHtml(child, visit)) }
  const documents = new Map<string, HtmlNode>()
  const anchors = new Map<string, Set<string>>()
  const routeForHtml = (path: string): string => '/' + path.replace(/(?:\/index)?\.html$/, '').replace(/^index$/, '')
  for (const path of htmlFiles) {
    const document = parse(await readFile(join(emitted, path), 'utf8')) as HtmlNode
    documents.set(path, document)
    const ids = new Set<string>()
    walkHtml(document, node => { const id = node.attrs?.find(attr => attr.name === 'id')?.value; if (id) ids.add(id) })
    anchors.set(routeForHtml(path), ids)
  }
  for (const [path, document] of documents) {
    walkHtml(document, node => {
      for (const attr of node.attrs ?? []) {
        if (!['href', 'src', 'action', 'poster', 'srcset'].includes(attr.name)) continue
        const url = attr.value
        if (node.nodeName === 'a' && attr.name === 'href' && url.includes('#') && !url.includes('://')) {
          const [target, anchor] = url.split('#')
          if (target === '/openapi.json') validateArtifactLink(raw, url)
          else if (anchor) assert(anchors.get(target || routeForHtml(path))?.has(decodeURIComponent(anchor)), `Missing emitted heading anchor: ${path}: ${url}`)
        }
        if (url.startsWith('#')) continue
        const rel = node.attrs?.find(item => item.name === 'rel')?.value ?? ''
        const isResource = attr.name !== 'href' || node.nodeName === 'script' || (node.nodeName === 'link' && ['stylesheet', 'preload', 'modulepreload', 'icon'].includes(rel))
        if (isResource) {
          assert(url.startsWith('/') && !url.startsWith('//') && !url.includes('?'), `External/unqualified browser resource: ${path}: ${url}`)
          const file = url.slice(1)
          assert(files.includes(file), `Missing browser resource: ${url}`)
          assert(/\.(?:js|css|woff2?|ttf|ico|svg|png)$/.test(file), `Unapproved browser resource type: ${url}`)
        } else {
          const target = url.split('#')[0]!
          assert(routes.has(target) || routes.has(target.replace(/\.md$/, '').replace(/\/index$/, '')) || publicArtifacts.has(target.slice(1)) || target === '/' || (manifest.externalLinks as readonly string[]).includes(target), `Unlisted browser link: ${path}: ${url}`)
        }
      }
      assert(!['iframe', 'object', 'embed', 'form'].includes(node.nodeName), `Unapproved active browser surface: ${path}: ${node.nodeName}`)
    })
  }
  for (const name of ['openapi.json', 'SKILL.md', 'docs-manifest.json', 'docs-provenance.json']) {
    assert(await readFile(join(emitted, name), 'utf8') === await readFile(join(output, 'public', name), 'utf8'), `Emitted artifact differs: ${name}`)
  }
  // llms/search/Markdown come from the upstream content loader, whose entire input is checked above.
  // If prerendered indexes exist, their links still must close over that same approved collection.
  for (const name of files.filter(path => path.endsWith('.txt') || path.endsWith('.md'))) {
    const body = await readFile(join(emitted, name), 'utf8')
    if (name === 'SKILL.md') continue
    qualifyMarkdown(body, name, routes)
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await verifyDocs(resolve(process.argv[2] ?? '.'), resolve(process.argv[3] ?? 'packages/docs'), process.argv[4] && resolve(process.argv[4]))
