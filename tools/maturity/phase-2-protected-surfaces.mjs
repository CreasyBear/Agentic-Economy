import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DEFAULT_OUTPUT = resolve(ROOT, '.planning/maturity-execution/contracts/phase-2-protected-surfaces.json')
const CLASSIFICATIONS = resolve(ROOT, '.planning/maturity-execution/contracts/phase-2-protected-surfaces.classifications.json')
const INVENTORY_TEST = 'tests/maturity/phase-2-protected-surfaces.test.ts'
const EXPECTED_COUNTS = Object.freeze({
  serverFunctions: 43,
  publicConvex: 116,
  convexHttpActions: 1,
  crons: 10,
  backgroundFamilies: 25,
  frozenHttp: 39,
  frozenMcp: 14,
  frozenCli: 12,
})
const PUBLIC_CONVEX_REGISTRARS = new Set([
  'action',
  'actionGeneric',
  'mutation',
  'mutationGeneric',
  'query',
  'queryGeneric',
])
const AUTHORITY_SINKS = Object.freeze({
  interactive_account: Object.freeze(['convex/authz.ts:resolveBusinessActor']),
  canonical_agent: Object.freeze([
    'convex/authorityBoundary.ts:resolveCanonicalAgentBinding',
    'convex/agentAccessPrincipals.ts:verifySupplyAgentPrincipal',
    'convex/capabilityOperationInvocations.ts:resolveCurrentAgentAuthority',
  ]),
  signed_callback: Object.freeze([
    'src/modules/agent-access/service-auth-envelope.ts:verifyCustomerRequestServiceAssertion',
    'src/lib/server/stripe-money-webhook.ts:verifyStripeMoneyWebhook',
    'convex/sourceWriteAdmission.ts:requireSourceRead',
    'convex/sourceWriteAdmission.ts:requireSourceWrite',
  ]),
  workload_account: Object.freeze([
    'convex/capabilityOperationInvocations.ts:reconcilePersistedInvocationAuthority',
    'convex/capabilityProviderConnectionLifecycle.ts:readCurrentCleanupResourceAuthority',
    'convex/capabilitySupplyProbes.ts:readCurrentCapabilityProbeAuthority',
    'convex/moneyBillingAuthorization.ts:persistedInvocationAuthorityIsCurrent',
    'convex/workloadCron.ts:admitWorkloadCron',
    'convex/workloadCron.ts:reconcileWorkloadCronSnapshot',
    'convex/workloadCron.ts:bindWorkloadCronActionContext',
  ]),
})
const EXEMPT_BINDINGS = new Set([
  'public_non_consequential',
  'narrow_system_non_consequential',
])
const SOURCE_CALLERS = new Set([
  'callSourceQuery',
  'callSourceMutation',
  'callSourceAction',
  'callPublicSourceQuery',
  'callPublicSourceMutation',
  'callPublicSourceAction',
  'runQuery',
  'runMutation',
  'runAction',
])
const FUNCTION_REFERENCE_FACTORIES = new Set([
  'sourceQuery',
  'sourceMutation',
  'sourceAction',
  'makeFunctionReference',
])

const BACKGROUND_FAMILIES = [
  ['callback:stripe-money-webhook', 'callback', 'src/routes/api.stripe.webhook.ts', 'handleStripeWebhookRequest', 'signed_callback'],
  ['callback:provider-connection-cleanup', 'callback', 'convex/capabilityProviderConnectionCleanup.ts', 'completeWork', 'workload_account'],
  ['worker:capability-operation-run', 'worker', 'convex/capabilityOperationInvocationWorker.ts', 'run', 'workload_account'],
  ['worker:capability-operation-recover', 'worker', 'convex/capabilityOperationInvocationWorker.ts', 'recover', 'workload_account'],
  ['worker:provider-connection-cleanup', 'worker', 'convex/capabilityProviderConnectionCleanup.ts', 'run', 'workload_account'],
  ['continuation:operation-workpool-complete', 'continuation', 'convex/capabilityOperationInvocations.ts', 'completeWork', 'workload_account'],
  ['continuation:connection-workpool-complete', 'continuation', 'convex/capabilityProviderConnectionCleanup.ts', 'completeWork', 'workload_account'],
  ['job:facilitator-discovery', 'job', 'convex/facilitatorDiscoveryAction.ts', 'run', 'workload_account'],
  ['job:market-external-refresh', 'job', 'convex/marketExternalRefresh.ts', 'run', 'narrow_system_non_consequential'],
  ['job:market-registry-refresh', 'job', 'convex/marketExternalRegistryRefresh.ts', 'run', 'narrow_system_non_consequential'],
  ['job:market-aggregate-backfill', 'job', 'convex/marketAggregateBackfill.ts', 'run', 'narrow_system_non_consequential'],
  ['job:market-presence-refresh', 'job', 'convex/marketPresence.ts', 'refresh', 'narrow_system_non_consequential'],
  ['job:capability-supply-readiness', 'job', 'convex/capabilitySupplyReadiness.ts', 'probe', 'workload_account'],
  ['job:source-write-nonce-cleanup', 'job', 'convex/sourceWriteAdmission.ts', 'cleanupExpiredSourceWriteNonces', 'narrow_system_non_consequential'],
  ['job:oauth-grant-cleanup', 'job', 'convex/agentAccessOAuth.ts', 'cleanupExpiredOAuthGrants', 'narrow_system_non_consequential'],
  ['job:supplier-settlement', 'job', 'convex/moneyLedger.ts', 'runDailySupplierSettlement', 'workload_account'],
  ['reconciliation:scheduled-invocations', 'reconciliation', 'convex/capabilityOperationInvocationWorker.ts', 'reconcileScheduled', 'workload_account'],
  ['reconciliation:operation-http', 'reconciliation', 'src/routes/api.v1.operations.$invocationRef.reconcile.ts', 'Route', 'canonical_agent'],
  ['reconciliation:operation-convex', 'reconciliation', 'convex/capabilityOperationInvocations.ts', 'reconcileInvocation', 'canonical_agent'],
  ['reconciliation:owner-operation-convex', 'reconciliation', 'convex/capabilityOperationInvocations.ts', 'reconcileOwnerInvocation', 'interactive_account'],
  ['reconciliation:charge', 'reconciliation', 'convex/moneyLedger.ts', 'reconcileCharge', 'workload_account'],
  ['reconciliation:invocation-charge', 'reconciliation', 'convex/moneyLedger.ts', 'reconcileInvocationCharge', 'workload_account'],
  ['reconciliation:external-spend', 'reconciliation', 'convex/moneyLedger.ts', 'reconcileExternalInvocationSpend', 'workload_account'],
  ['reconciliation:payout-transfer', 'reconciliation', 'convex/moneyLedger.ts', 'reconcilePayoutTransfer', 'interactive_account'],
  ['reconciliation:x402-attempt', 'reconciliation', 'convex/moneyX402PaymentAttempts.ts', 'reconcileX402PaymentAttempt', 'workload_account'],
]

function filesUnder(directory) {
  return readdirSync(resolve(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return entry.name === '_generated' ? [] : filesUnder(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

function digest(source) {
  return createHash('sha256').update(source).digest('hex')
}

function projectPath(path) {
  return relative(ROOT, path).split(sep).join('/')
}

function exported(statement) {
  return statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true
}

function directRegistrar(initializer) {
  return ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression)
    ? initializer.expression.text
    : null
}

function containsRegistrar(initializer, registrar) {
  let found = false
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === registrar) found = true
    ts.forEachChild(node, visit)
  }
  visit(initializer)
  return found
}

function classificationMap() {
  const parsed = JSON.parse(readFileSync(CLASSIFICATIONS, 'utf8'))
  if (parsed.format !== 'phase-2-protected-surface-classifications:v1'
    || typeof parsed.rows !== 'object' || parsed.rows === null) {
    throw new Error('protected_surface_classifications_invalid')
  }
  return parsed.rows
}

function classification(ref, classifications) {
  const row = classifications[ref]
  if (row === undefined) throw new Error(`protected_surface_classification_missing:${ref}`)
  if (typeof row !== 'object' || row === null
    || typeof row.binding !== 'string'
    || typeof row.consequential !== 'boolean'
    || (EXEMPT_BINDINGS.has(row.binding) ? row.consequential : !row.consequential)) {
    throw new Error(`protected_surface_classification_invalid:${ref}`)
  }
  return row
}

function createSourceGraph() {
  const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, 'tsconfig.json')
  if (configPath === undefined) throw new Error('protected_surface_tsconfig_missing')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error !== undefined) throw new Error('protected_surface_tsconfig_invalid')
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT)
  const program = ts.createProgram(parsed.fileNames, parsed.options)
  const checker = program.getTypeChecker()
  const nodes = new Map()
  const declarationToRef = new Map()

  for (const source of program.getSourceFiles()) {
    const file = projectPath(source.fileName)
    if ((!file.startsWith('src/') && !file.startsWith('convex/'))
      || file.startsWith('convex/_generated/')) continue
    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
        registerGraphNode(nodes, declarationToRef, source, file, statement.name.text, statement)
      }
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          registerGraphNode(nodes, declarationToRef, source, file, declaration.name.text, declaration)
        }
      }
    }
  }

  for (const graphNode of nodes.values()) {
    const edges = new Map()
    function addSymbolEdge(location, via) {
      let symbol = checker.getSymbolAtLocation(location)
      if (symbol === undefined) return
      if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) symbol = checker.getAliasedSymbol(symbol)
      for (const declaration of symbol.declarations ?? []) {
        const target = enclosingGraphRef(declaration, declarationToRef)
        if (target !== undefined && target !== graphNode.ref) edges.set(target, via)
      }
    }
    function visit(node) {
      if (ts.isPropertyAssignment(node)
        && ((ts.isIdentifier(node.name) && node.name.text === 'handler')
          || (ts.isStringLiteralLike(node.name) && node.name.text === 'handler'))) {
        addSymbolEdge(node.initializer, 'call')
      }
      if (ts.isCallExpression(node)) {
        addSymbolEdge(node.expression, 'call')
        const calleeName = ts.isIdentifier(node.expression)
          ? node.expression.text
          : ts.isPropertyAccessExpression(node.expression)
            ? node.expression.name.text
            : undefined
        if (calleeName !== undefined && SOURCE_CALLERS.has(calleeName)
          && node.arguments[0] !== undefined) {
          addSymbolEdge(node.arguments[0], 'function_reference')
        }
        if (calleeName !== undefined && FUNCTION_REFERENCE_FACTORIES.has(calleeName)
          && node.arguments[0] !== undefined && ts.isStringLiteralLike(node.arguments[0])) {
          const target = sourceFunctionReference(node.arguments[0].text)
          if (target !== undefined && nodes.has(target) && target !== graphNode.ref) {
            edges.set(target, 'function_reference')
          }
        }
        if (ts.isPropertyAccessExpression(node.expression)
          && node.expression.name.text === 'handler') {
          for (const argument of node.arguments) addSymbolEdge(argument, 'call')
        }
        for (const argument of node.arguments) {
          for (const target of convexFunctionReferences(argument)) {
            if (nodes.has(target) && target !== graphNode.ref) edges.set(target, 'function_reference')
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(graphNode.declaration)
    graphNode.edges = [...edges].map(([target, via]) => ({ target, via }))
      .sort((left, right) => left.target.localeCompare(right.target))
  }
  return nodes
}

function sourceFunctionReference(value) {
  const match = /^([A-Za-z0-9_/]+):([A-Za-z0-9_]+)$/u.exec(value)
  return match === null ? undefined : `convex/${match[1]}.ts:${match[2]}`
}

function registerGraphNode(nodes, declarationToRef, source, file, symbol, declaration) {
  const ref = `${file}:${symbol}`
  const start = source.getLineAndCharacterOfPosition(declaration.getStart(source))
  const text = declaration.getText(source)
  nodes.set(ref, {
    ref,
    declaration,
    identity: {
      file,
      symbol,
      line: start.line + 1,
      column: start.character + 1,
      sha256: digest(text),
    },
    edges: [],
  })
  declarationToRef.set(declaration, ref)
}

function enclosingGraphRef(declaration, declarationToRef) {
  let current = declaration
  while (current !== undefined && !ts.isSourceFile(current)) {
    const ref = declarationToRef.get(current)
    if (ref !== undefined) return ref
    current = current.parent
  }
  return undefined
}

function convexFunctionReferences(node) {
  const references = []
  function visit(current) {
    if (ts.isPropertyAccessExpression(current)) {
      const parts = []
      let cursor = current
      while (ts.isPropertyAccessExpression(cursor)) {
        parts.unshift(cursor.name.text)
        cursor = cursor.expression
      }
      if (ts.isIdentifier(cursor) && (cursor.text === 'api' || cursor.text === 'internal')
        && parts.length >= 2) {
        references.push(`convex/${parts.slice(0, -1).join('/')}.ts:${parts.at(-1)}`)
      }
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return references
}

function traceAuthorityPath(graph, declarationRef, binding, surfaceRef = declarationRef) {
  const sinks = AUTHORITY_SINKS[binding]
  if (sinks === undefined) return undefined
  const queue = [{ ref: declarationRef, path: [] }]
  const seen = new Set()
  while (queue.length > 0) {
    const current = queue.shift()
    if (seen.has(current.ref)) continue
    seen.add(current.ref)
    const node = graph.get(current.ref)
    if (node === undefined) continue
    const path = current.path.length === 0
      ? [{ ref: surfaceRef, file: node.identity.file, line: node.identity.line, column: node.identity.column, via: 'declaration' }]
      : current.path
    if (sinks.includes(current.ref) && path.length >= 2) {
      return { authoritySink: current.ref, authorityPath: path }
    }
    for (const edge of node.edges) {
      const target = graph.get(edge.target)
      if (target === undefined || seen.has(edge.target)) continue
      queue.push({
        ref: edge.target,
        path: [...path, {
          ref: edge.target,
          file: target.identity.file,
          line: target.identity.line,
          column: target.identity.column,
          via: edge.via,
        }],
      })
    }
  }
  return undefined
}

function verifiedExemption(ref, symbol, declared) {
  const proof = declared.exemption
  if (typeof proof !== 'object' || proof === null) return undefined
  const { testFile, testName } = proof
  if (typeof testFile !== 'string' || typeof testName !== 'string'
    || testFile === INVENTORY_TEST
    || !/^tests\/.+\.test\.ts$/u.test(testFile)
    || !existsSync(resolve(ROOT, testFile))) return undefined
  const source = readFileSync(resolve(ROOT, testFile), 'utf8')
  if (!behaviorTestProvesSymbol(source, testFile, testName, symbol)) return undefined
  return Object.freeze({ testFile, testName, sourceRef: ref, sha256: digest(source) })
}

function behaviorTestProvesSymbol(source, file, testName, symbol) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  let proven = false
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && (node.expression.text === 'it' || node.expression.text === 'test')
      && node.arguments[0] !== undefined && ts.isStringLiteralLike(node.arguments[0])) {
      const behavior = node.arguments[1]
      if (node.arguments[0].text === testName && behavior !== undefined
        && new RegExp(`\\b${escapeRegExp(symbol)}\\b`, 'u').test(behavior.getText(ast))) {
        proven = true
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return proven
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function evaluateSurface(graph, input, declared) {
  const base = {
    ref: input.ref,
    kind: input.kind,
    file: input.file,
    symbol: input.symbol,
    registrar: input.registrar,
    binding: declared.binding,
    consequential: declared.consequential,
    sha256: input.sha256,
    declaration: input.declaration,
  }
  if (EXEMPT_BINDINGS.has(declared.binding)) {
    const exemption = verifiedExemption(input.ref, input.symbol, declared)
    return exemption === undefined
      ? { ...base, status: 'blocked', marker: `missing_tested_exemption:${input.ref}`, blocker: {
          code: 'missing_tested_exemption',
          detail: 'No independent existing behavior test proves this public/system exemption.',
        } }
      : { ...base, status: 'bound', marker: `tested_exemption:${exemption.testFile}:${exemption.testName}`, exemption }
  }
  const authority = traceAuthorityPath(graph, input.declarationRef, declared.binding, input.ref)
  return authority === undefined
    ? { ...base, status: 'blocked', marker: `missing_transitive_authority_path:${input.ref}`, blocker: {
        code: 'missing_transitive_authority_path',
        detail: `No declaration/call path reaches an allowed ${declared.binding} authority seam.`,
      } }
    : { ...base, status: 'bound', marker: `transitive_authority_path:${input.ref}=>${authority.authoritySink}`, ...authority }
}

function surfaceInput(graph, ref, kind, path, symbol, registrar) {
  const declarationRef = `${path}:${symbol}`
  const node = graph.get(declarationRef)
  if (node === undefined) throw new Error(`protected_surface_symbol_missing:${path}:${symbol}`)
  return {
    ref,
    kind,
    file: path,
    symbol,
    registrar,
    declarationRef,
    declaration: node.identity,
    sha256: digest(readFileSync(resolve(ROOT, path), 'utf8')),
  }
}

export function inspectProtectedSurfaceGraph(ref) {
  const graph = createSourceGraph()
  const node = graph.get(ref)
  return node === undefined ? undefined : {
    ref: node.ref,
    declaration: node.identity,
    edges: node.edges,
  }
}

export function collectProtectedSurfaces() {
  const classifications = classificationMap()
  const graph = createSourceGraph()
  const frozenSource = readFileSync(resolve(ROOT, '.planning/maturity-execution/contracts/public-surface-inventory.json'), 'utf8')
  const frozenInventory = JSON.parse(frozenSource)
  const serverFunctions = []
  for (const path of filesUnder('src')) {
    const source = readFileSync(resolve(ROOT, path), 'utf8')
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
    for (const statement of ast.statements) {
      if (!ts.isVariableStatement(statement) || !exported(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer || !ts.isIdentifier(declaration.name)
          || !containsRegistrar(declaration.initializer, 'createServerFn')) continue
        const ref = `${path}:${declaration.name.text}`
        serverFunctions.push(evaluateSurface(
          graph,
          surfaceInput(graph, ref, 'server_function', path, declaration.name.text, 'createServerFn'),
          classification(ref, classifications),
        ))
      }
    }
  }

  const publicConvex = []
  const convexHttpActions = []
  for (const path of filesUnder('convex')) {
    const source = readFileSync(resolve(ROOT, path), 'utf8')
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
    for (const statement of ast.statements) {
      if (!ts.isVariableStatement(statement) || !exported(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer || !ts.isIdentifier(declaration.name)) continue
        const registrar = directRegistrar(declaration.initializer)
        if (registrar !== 'httpAction' && (registrar === null || !PUBLIC_CONVEX_REGISTRARS.has(registrar))) continue
        const ref = `${path}:${declaration.name.text}`
        const row = evaluateSurface(
          graph,
          surfaceInput(graph, ref, registrar === 'httpAction' ? 'http' : 'convex_public', path, declaration.name.text, registrar),
          classification(ref, classifications),
        )
        if (registrar === 'httpAction') convexHttpActions.push(row)
        else publicConvex.push(row)
      }
    }
  }

  const backgroundFamilies = BACKGROUND_FAMILIES.map(([ref, kind, path, symbol, binding]) => {
    const declared = classification(ref, classifications)
    if (declared.binding !== binding) throw new Error(`protected_surface_classification_conflict:${ref}`)
    return evaluateSurface(
      graph,
      surfaceInput(graph, ref, kind, path, symbol, 'background_family'),
      declared,
    )
  })

  const cronSource = readFileSync(resolve(ROOT, 'convex/crons.ts'), 'utf8')
  const crons = [...cronSource.matchAll(/crons\.(?:interval|cron)\(\s*['"]([^'"]+)['"][\s\S]*?internal\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/g)]
    .map((match) => {
      const ref = `cron:${match[1]}`
      const path = `convex/${match[2]}.ts`
      const symbol = match[3]
      const declared = classification(ref, classifications)
      if (declared.binding !== 'workload_account') throw new Error(`protected_surface_classification_conflict:${ref}`)
      return evaluateSurface(
        graph,
        surfaceInput(graph, ref, 'cron', path, symbol, 'cron'),
        declared,
      )
    })

  const sort = (rows) => rows.sort((left, right) => left.ref.localeCompare(right.ref))
  const inventory = {
    format: 'phase-2-protected-surfaces:v2',
    expectedCounts: EXPECTED_COUNTS,
    actualCounts: {
      serverFunctions: serverFunctions.length,
      publicConvex: publicConvex.length,
      convexHttpActions: convexHttpActions.length,
      crons: crons.length,
      backgroundFamilies: backgroundFamilies.length,
      frozenHttp: frozenInventory.http?.length,
      frozenMcp: frozenInventory.mcp?.length,
      frozenCli: frozenInventory.cli?.length,
    },
    frozenContract: {
      sourceFile: '.planning/maturity-execution/contracts/public-surface-inventory.json',
      sha256: digest(frozenSource),
      httpRefs: frozenInventory.http?.map((row) => row.id).sort(),
      mcpRefs: frozenInventory.mcp?.map((row) => row.actionId).sort(),
      cliRefs: frozenInventory.cli?.map((row) => row.command).sort(),
    },
    serverFunctions: sort(serverFunctions),
    publicConvex: sort(publicConvex),
    convexHttpActions: sort(convexHttpActions),
    crons: sort(crons),
    backgroundFamilies: sort(backgroundFamilies),
  }
  const rows = allRows(inventory)
  inventory.blockedByKind = Object.fromEntries(
    [...new Set(rows.map((row) => row.kind))].sort()
      .map((kind) => [kind, rows.filter((row) => row.kind === kind && row.status === 'blocked').length]),
  )
  const discoveredRefs = rows.map((row) => row.ref).sort()
  const classifiedRefs = Object.keys(classifications).sort()
  if (JSON.stringify(discoveredRefs) !== JSON.stringify(classifiedRefs)) {
    throw new Error('protected_surface_classification_inventory_mismatch')
  }
  validateProtectedSurfaceInventory(inventory)
  return inventory
}

function allRows(inventory) {
  return [
    ...inventory.serverFunctions,
    ...inventory.publicConvex,
    ...inventory.convexHttpActions,
    ...inventory.crons,
    ...inventory.backgroundFamilies,
  ]
}

export function validateProtectedSurfaceInventory(inventory) {
  if (inventory.format !== 'phase-2-protected-surfaces:v2'
    || JSON.stringify(inventory.expectedCounts) !== JSON.stringify(EXPECTED_COUNTS)
    || JSON.stringify(inventory.actualCounts) !== JSON.stringify(EXPECTED_COUNTS)
    || inventory.serverFunctions.length !== EXPECTED_COUNTS.serverFunctions
    || inventory.publicConvex.length !== EXPECTED_COUNTS.publicConvex
    || inventory.convexHttpActions.length !== EXPECTED_COUNTS.convexHttpActions
    || inventory.crons.length !== EXPECTED_COUNTS.crons
    || inventory.backgroundFamilies.length !== EXPECTED_COUNTS.backgroundFamilies
    || inventory.frozenContract?.sourceFile !== '.planning/maturity-execution/contracts/public-surface-inventory.json'
    || !/^[a-f0-9]{64}$/u.test(inventory.frozenContract?.sha256 ?? '')
    || inventory.frozenContract?.httpRefs?.length !== EXPECTED_COUNTS.frozenHttp
    || inventory.frozenContract?.mcpRefs?.length !== EXPECTED_COUNTS.frozenMcp
    || inventory.frozenContract?.cliRefs?.length !== EXPECTED_COUNTS.frozenCli
    || new Set(inventory.frozenContract?.httpRefs).size !== EXPECTED_COUNTS.frozenHttp
    || new Set(inventory.frozenContract?.mcpRefs).size !== EXPECTED_COUNTS.frozenMcp
    || new Set(inventory.frozenContract?.cliRefs).size !== EXPECTED_COUNTS.frozenCli) {
    throw new Error('protected_surface_inventory_count_invalid')
  }
  const rows = allRows(inventory)
  if (new Set(rows.map((row) => row.ref)).size !== rows.length) {
    throw new Error('protected_surface_inventory_duplicate')
  }
  for (const row of rows) {
    if (!/^[a-f0-9]{64}$/u.test(row.sha256)
      || !/^[a-f0-9]{64}$/u.test(row.declaration?.sha256 ?? '')
      || row.declaration?.file !== row.file
      || row.declaration?.symbol !== row.symbol
      || !Number.isInteger(row.declaration?.line) || row.declaration.line < 1
      || !Number.isInteger(row.declaration?.column) || row.declaration.column < 1) {
      throw new Error(`protected_surface_source_identity_invalid:${row.ref}`)
    }
    if (row.status === 'blocked') {
      if (typeof row.blocker?.code !== 'string' || typeof row.blocker?.detail !== 'string'
        || row.authorityPath !== undefined || row.authoritySink !== undefined || row.exemption !== undefined) {
        throw new Error(`protected_surface_blocker_invalid:${row.ref}`)
      }
      continue
    }
    if (row.status !== 'bound' || row.blocker !== undefined) {
      throw new Error(`protected_surface_status_invalid:${row.ref}`)
    }
    if (EXEMPT_BINDINGS.has(row.binding)) {
      if (row.exemption?.sourceRef !== row.ref
        || row.exemption?.testFile === INVENTORY_TEST
        || !/^tests\/.+\.test\.ts$/u.test(row.exemption?.testFile ?? '')
        || typeof row.exemption?.testName !== 'string'
        || !/^[a-f0-9]{64}$/u.test(row.exemption?.sha256 ?? '')
        || row.authorityPath !== undefined || row.authoritySink !== undefined) {
        throw new Error(`protected_surface_exemption_invalid:${row.ref}`)
      }
    } else if (!Array.isArray(row.authorityPath) || row.authorityPath.length < 2
      || row.authorityPath[0]?.ref !== row.ref
      || row.authorityPath.at(-1)?.ref !== row.authoritySink
      || !AUTHORITY_SINKS[row.binding]?.includes(row.authoritySink)
      || row.authorityPath[0]?.via !== 'declaration'
      || row.authorityPath.slice(1).some((hop) => hop.via !== 'call' && hop.via !== 'function_reference')
      || row.exemption !== undefined) {
      throw new Error(`protected_surface_authority_path_invalid:${row.ref}`)
    }
  }
  const blocked = rows.filter((row) => row.status === 'blocked')
  const blockedKinds = [...new Set(rows.map((row) => row.kind))].sort()
  if (JSON.stringify(Object.keys(inventory.blockedByKind ?? {}).sort()) !== JSON.stringify(blockedKinds)) {
    throw new Error('protected_surface_blocked_ledger_invalid')
  }
  for (const [kind, count] of Object.entries(inventory.blockedByKind ?? {})) {
    if (count !== blocked.filter((row) => row.kind === kind).length) {
      throw new Error('protected_surface_blocked_ledger_invalid')
    }
  }
  if (Object.values(inventory.blockedByKind ?? {}).reduce((total, count) => total + count, 0) !== blocked.length) {
    throw new Error('protected_surface_blocked_ledger_invalid')
  }
  return inventory
}

export function writeProtectedSurfaceInventory(output = DEFAULT_OUTPUT) {
  const inventory = collectProtectedSurfaces()
  writeFileSync(output, `${JSON.stringify(inventory, null, 2)}\n`)
  return inventory
}

export function checkProtectedSurfaceInventory(output = DEFAULT_OUTPUT) {
  if (!existsSync(output)) throw new Error('protected_surface_inventory_missing')
  const expected = JSON.parse(readFileSync(output, 'utf8'))
  validateProtectedSurfaceInventory(expected)
  const actual = collectProtectedSurfaces()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('protected_surface_inventory_drift')
  return actual
}

function outputArgument(argv) {
  const index = argv.indexOf('--output')
  if (index === -1) return DEFAULT_OUTPUT
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error('protected_surface_output_argument_missing')
  return resolve(ROOT, value)
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const output = outputArgument(process.argv)
  const snapshotOnly = process.argv.includes('--check-snapshot')
  const check = process.argv.includes('--check') || snapshotOnly || process.argv.includes('--require-bound')
  const inventory = check ? checkProtectedSurfaceInventory(output) : writeProtectedSurfaceInventory(output)
  const blocked = allRows(inventory).filter((row) => row.status === 'blocked')
  process.stdout.write(`${JSON.stringify({
    counts: inventory.actualCounts,
    bound: allRows(inventory).length - blocked.length,
    blocked: blocked.length,
    blockedByKind: inventory.blockedByKind,
    blockerRefs: blocked.map((row) => row.ref),
  }, null, 2)}\n`)
  if (process.argv.includes('--require-bound') && blocked.length > 0) process.exitCode = 1
}
