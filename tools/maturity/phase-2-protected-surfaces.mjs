import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DEFAULT_OUTPUT = resolve(ROOT, '.planning/maturity-execution/contracts/phase-2-protected-surfaces.json')
const SINK_TEST_REGISTRY = resolve(ROOT, '.planning/maturity-execution/contracts/phase-2-authority-sink-runtime-tests.json')
const SURFACE_AUTHORITY_MAP = resolve(ROOT, '.planning/maturity-execution/contracts/phase-2-surface-authority-map.json')
const CLASSIFICATIONS = resolve(ROOT, '.planning/maturity-execution/contracts/phase-2-protected-surfaces.classifications.json')
const INVENTORY_TEST = 'tests/maturity/phase-2-protected-surfaces.test.ts'
const BASELINE_COUNTS = Object.freeze({
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
const CONVEX_HTTP_REGISTRARS = new Set(['httpAction', 'httpActionGeneric'])
const ALL_CONVEX_REGISTRARS = new Set([
  ...PUBLIC_CONVEX_REGISTRARS,
  ...CONVEX_HTTP_REGISTRARS,
  'internalAction',
  'internalActionGeneric',
  'internalMutation',
  'internalMutationGeneric',
  'internalQuery',
  'internalQueryGeneric',
])
const AUTHORITY_SINKS = Object.freeze({
  interactive_account: Object.freeze([
    'convex/authz.ts:resolveBusinessActor',
    'convex/interactiveAuthority.ts:resolveInteractiveAuthorityContext',
    'convex/interactiveAuthority.ts:resolveMaterializedInteractiveAuthorityContext',
    'convex/interactiveAuthority.ts:resolveScheduledInteractiveAuthorityContext',
    'convex/interactiveAuthority.ts:currentContextAtTrustedServerTime',
    'convex/recoveryBreakGlass.ts:resolveRecoveryAccountFacts',
    'convex/recoveryBreakGlass.ts:resolveRecoveryOperator',
  ]),
  canonical_agent: Object.freeze([
    'convex/authorityBoundary.ts:resolveCanonicalAgentBinding',
    'convex/lib/canonicalAgentAuthority.ts:resolveCanonicalAgentContext',
    'convex/lib/canonicalAgentAuthority.ts:validateCanonicalAgentDelegation',
    'convex/agentAccessPrincipals.ts:verifySupplyAgentPrincipal',
    'convex/lib/operationInvocations/authorityHandlers.ts:resolveCurrentAgentAuthority',
    'convex/capabilityProviderConsequenceJournal.ts:attestProviderConsequenceTicketHandler',
    'convex/capabilityProviderConsequenceJournal.ts:claimProviderConsequenceHandler',
    'convex/capabilityProviderConsequenceJournal.ts:completeProviderConsequenceHandler',
    'convex/capabilityProviderConsequenceJournal.ts:abortProviderConsequenceHandler',
    'convex/capabilityProviderConsequenceJournal.ts:authorizeProviderConsequenceX402RpcHandler',
  ]),
  signed_callback: Object.freeze([
    'src/modules/agent-access/service-auth-envelope.ts:verifyCustomerRequestServiceAssertion',
    'src/lib/server/stripe-money-webhook.ts:verifyStripeMoneyWebhook',
    'convex/sourceWriteAdmission.ts:requireSourceRead',
    'convex/sourceWriteAdmission.ts:requireSourceWrite',
  ]),
  workload_account: Object.freeze([
    'convex/lib/operationInvocations/authorityHandlers.ts:reconcilePersistedInvocationAuthority',
    'convex/lib/providerConnections/authority.ts:readCurrentCleanupResourceAuthority',
    'convex/capabilitySupplyProbes.ts:readCurrentCapabilityProbeAuthority',
    'convex/moneyBillingAuthorization.ts:persistedInvocationAuthorityIsCurrent',
    'convex/workloadCron.ts:admitWorkloadCron',
    'convex/workloadCron.ts:reconcileWorkloadCronSnapshot',
    'convex/workloadCron.ts:bindWorkloadCronActionContext',
    'convex/catalogOfferingMutations.ts:admitDevSeedCatalogAuthority',
    'convex/lib/secretLifecyclePersistence.ts:requireSnapshot',
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
const CONSEQUENCE_CALLS = new Set([
  'action',
  'callPublicSourceAction',
  'callPublicSourceMutation',
  'callSourceAction',
  'callSourceMutation',
  'delete',
  'enqueueAction',
  'fetch',
  'insert',
  'mutation',
  'patch',
  'postConvex',
  'replace',
  'runAction',
  'runAfter',
  'runAt',
  'runMutation',
  'sendGuardedHttpRequest',
])
const ISOLATION_CASE_LABELS = Object.freeze([
  'owner',
  'member',
  'workload',
  'missing_workload',
  'stranger',
  'wrong_account',
  'stale_generation',
])
const SINK_TEST_ASSIGNMENTS = Object.freeze({
  'convex/authz.ts:resolveBusinessActor': ['convex/capabilityProviderConnections.ts:readOwner', 'tests/maturity/phase-2-owner-query-authority.test.ts', 'evaluates resolveBusinessActor %s through the registered account-scoped provider query'],
  'convex/sourceWriteAdmission.ts:requireSourceRead': ['convex/actionInvocationControl.ts:readControlSource', 'tests/unit/convex/source-write-admission.test.ts', 'drives the %s isolation case through both registered source handlers without a denied data or control effect'],
  'convex/sourceWriteAdmission.ts:requireSourceWrite': ['convex/actionInvocationControl.ts:recordLateObservationSource', 'tests/unit/convex/source-write-admission.test.ts', 'drives the %s isolation case through both registered source handlers without a denied data or control effect'],
  'src/modules/agent-access/service-auth-envelope.ts:verifyCustomerRequestServiceAssertion': ['convex/capabilitySupplyOperations.ts:readKeylessExecutable', 'tests/integration/capability-supply-operations.test.ts', 'drives the %s isolation case through the registered fixed-query descriptor handler'],
  'convex/lib/canonicalAgentAuthority.ts:resolveCanonicalAgentContext': ['convex/agentAccessPrincipals.ts:registerAgentPrincipal', 'tests/unit/convex/capability-operation-authority-boundary.test.ts', 'drives the %s isolation case through the registered agent registration mutation and its real canonical-context sink'],
  'convex/authorityBoundary.ts:resolveCanonicalAgentBinding': ['convex/authorityBoundary.ts:resolveAgentBinding', 'tests/unit/convex/authority-boundary.test.ts', 'drives the %s isolation case through the registered mutation and commits no denied authority snapshot'],
  'convex/lib/operationInvocations/authorityHandlers.ts:resolveCurrentAgentAuthority': ['convex/capabilityOperationInvocations.ts:cancelInvocation', 'tests/unit/convex/capability-operation-authority-boundary.test.ts', 'drives the %s isolation case through the registered cancel action and its real current-agent sink'],
  'convex/agentAccessPrincipals.ts:verifySupplyAgentPrincipal': ['convex/capabilitySupplyOwnerFunnel.ts:reserveOwnerCapabilityPublication', 'tests/integration/capability-supply-owner-funnel-reserve.test.ts', 'drives the %s isolation case through the registered reservation mutation without a denied publication effect'],
  'convex/interactiveAuthority.ts:resolveInteractiveAuthorityContext': ['convex/interactiveAuthority.ts:materializeCurrentInteractiveAuthority', 'tests/integration/chat-scheduled-authority.test.ts', 'evaluates resolveInteractiveAuthorityContext %s through the registered materialization mutation'],
  'convex/recoveryBreakGlass.ts:resolveRecoveryAccountFacts': ['convex/recoveryBreakGlass.ts:authorizeRecoveryOperation', 'tests/unit/convex/recovery-break-glass-driver.test.ts', 'evaluates %s through the registered recovery operation with atomic denial'],
  'convex/capabilityProviderConsequenceJournal.ts:abortProviderConsequenceHandler': ['convex/providerConsequenceHttp.ts:abortProviderConsequenceJournal', 'tests/unit/capability-execution/provider-consequence-journal.test.ts', 'drives the %s isolation case through the registered provider abort route and abortProviderConsequence sink'],
  'convex/capabilityProviderConsequenceJournal.ts:attestProviderConsequenceTicketHandler': ['convex/providerConsequenceHttp.ts:attestProviderConsequenceTicket', 'tests/unit/capability-execution/provider-consequence-journal.test.ts', 'drives the %s isolation case through the registered provider attest route and attestProviderConsequenceTicket sink'],
  'convex/capabilityProviderConsequenceJournal.ts:claimProviderConsequenceHandler': ['convex/providerConsequenceHttp.ts:beginProviderConsequenceJournal', 'tests/unit/capability-execution/provider-consequence-journal.test.ts', 'drives the %s isolation case through the registered provider begin route and claimProviderConsequence sink'],
  'convex/capabilityProviderConsequenceJournal.ts:completeProviderConsequenceHandler': ['convex/providerConsequenceHttp.ts:completeProviderConsequenceJournal', 'tests/unit/capability-execution/provider-consequence-journal.test.ts', 'drives the %s isolation case through the registered provider complete route and completeProviderConsequence sink'],
  'convex/capabilityProviderConsequenceJournal.ts:authorizeProviderConsequenceX402RpcHandler': ['convex/providerConsequenceHttp.ts:providerConsequenceX402Rpc', 'tests/unit/capability-execution/provider-consequence-journal.test.ts', 'drives the %s isolation case through the registered provider x402 route and authorizeProviderConsequenceX402Rpc sink'],
  'convex/lib/secretLifecyclePersistence.ts:requireSnapshot': ['convex/secretLifecycleHttp.ts:secretLifecycleRpc', 'tests/integration/phase-2-runtime-sink-handlers.test.ts', 'drives the %s isolation case through the registered secret lifecycle route and requireSnapshot sink'],
  'convex/workloadCron.ts:reconcileWorkloadCronSnapshot': ['reconciliation:convex/workloadCron.ts:reconcile', 'tests/unit/convex/workload-cron.test.ts', 'evaluates %s through the registered workload reconciliation and scheduled probe before dispatch'],
  'convex/workloadCron.ts:bindWorkloadCronActionContext': ['scheduler:convex/capabilitySupplyReadiness.ts:probeFromCron', 'tests/unit/convex/workload-cron.test.ts', 'evaluates %s through the registered workload reconciliation and scheduled probe before dispatch'],
  'convex/workloadCron.ts:admitWorkloadCron': ['cron:refresh capability supply readiness', 'tests/unit/convex/workload-cron.test.ts', 'evaluates %s through the registered workload reconciliation and scheduled probe before dispatch'],
  'src/lib/server/stripe-money-webhook.ts:verifyStripeMoneyWebhook': ['callback:src/routes/api.stripe.webhook.ts:Route', 'tests/integration/phase-2-runtime-sink-handlers.test.ts', 'drives the %s isolation case through the registered Stripe webhook route and signature sink'],
  'convex/lib/operationInvocations/authorityHandlers.ts:reconcilePersistedInvocationAuthority': ['workpool:convex/capabilityOperationInvocationWorker.ts:run', 'tests/integration/phase-2-runtime-sink-handlers.test.ts', 'drives the %s isolation case through the registered invocation worker run action and reconcilePersistedInvocationAuthority sink'],
  'convex/lib/providerConnections/authority.ts:readCurrentCleanupResourceAuthority': ['workpool:convex/capabilityProviderConnectionCleanup.ts:run', 'tests/unit/convex/provider-connection-driver.test.ts', 'evaluates readCurrentCleanupResourceAuthority %s through the registered cleanup action'],
  'convex/capabilitySupplyProbes.ts:readCurrentCapabilityProbeAuthority': ['scheduler:convex/capabilitySupplyReadiness.ts:probe', 'tests/integration/capability-publication-probe.test.ts', 'evaluates readCurrentCapabilityProbeAuthority %s through the registered readiness action'],
  'convex/interactiveAuthority.ts:resolveScheduledInteractiveAuthorityContext': ['scheduler:convex/chatGenerate.ts:generate', 'tests/integration/chat-scheduled-authority.test.ts', 'evaluates resolveScheduledInteractiveAuthorityContext %s through the registered generation action'],
  'convex/moneyBillingAuthorization.ts:persistedInvocationAuthorityIsCurrent': ['reconciliation:convex/moneyLedger.ts:reconcileExternalInvocationSpend', 'tests/integration/money-external-spend.test.ts', 'evaluates %s through the registered external-spend reconciler with no denied ledger effect'],
  'convex/interactiveAuthority.ts:currentContextAtTrustedServerTime': ['run_action:convex/interactiveAuthority.ts:resolveCurrentInteractiveAuthority', 'tests/unit/convex/interactive-authority.test.ts', 'evaluates %s through the registered trusted-time action without mutating authority facts'],
  'convex/catalogOfferingMutations.ts:admitDevSeedCatalogAuthority': ['scheduler:convex/devSeed.ts:seedOfferingSupply', 'tests/integration/catalog-system-offering-authority.test.ts', 'evaluates %s through the registered seed worker before any catalog consequence'],
})

function filesUnder(directory) {
  return readdirSync(resolve(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return entry.name === '_generated' ? [] : filesUnder(path)
    return /\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\.tsx?$/u.test(entry.name) ? [path] : []
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

function nearestCall(node, boundary) {
  let current = node
  while (current !== undefined && current !== boundary) {
    if (ts.isCallExpression(current)) return current
    current = current.parent
  }
  return undefined
}

function executionControlPath(node, boundary) {
  const path = []
  let child = node
  let current = node.parent
  while (current !== undefined && current !== boundary) {
    if (ts.isIfStatement(current)) {
      const branch = current.thenStatement === child ? 'then'
        : current.elseStatement === child ? 'else' : 'condition'
      path.push(`if:${current.getStart()}:${branch}`)
    } else if (ts.isConditionalExpression(current)) {
      const branch = current.whenTrue === child ? 'true'
        : current.whenFalse === child ? 'false' : 'condition'
      path.push(`conditional:${current.getStart()}:${branch}`)
    } else if (ts.isCaseClause(current) || ts.isDefaultClause(current)) {
      path.push(`switch:${current.getStart()}`)
    } else if (ts.isForStatement(current) || ts.isForInStatement(current)
      || ts.isForOfStatement(current) || ts.isWhileStatement(current)
      || ts.isDoStatement(current)) {
      path.push(`loop:${current.getStart()}`)
    } else if (ts.isCatchClause(current)) {
      path.push(`catch:${current.getStart()}`)
    }
    child = current
    current = current.parent
  }
  return path.reverse()
}

function consequenceCallName(node) {
  if (!ts.isCallExpression(node)) return undefined
  if (ts.isIdentifier(node.expression)) return node.expression.text
  return ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : undefined
}

function controlPathDominates(guard, effect) {
  const branchGuards = guard.filter((segment) => !segment.endsWith(':condition'))
  return branchGuards.every((segment, index) => effect[index] === segment)
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
    const effects = []
    function addSymbolEdge(location, via) {
      let symbol = checker.getSymbolAtLocation(location)
      if (symbol === undefined) return
      if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) symbol = checker.getAliasedSymbol(symbol)
      for (const declaration of symbol.declarations ?? []) {
        const target = enclosingGraphRef(declaration, declarationToRef)
        if (target !== undefined && target !== graphNode.ref) {
          const call = nearestCall(location, graphNode.declaration)
          const site = call ?? location
          const candidate = {
            target,
            via,
            offset: site.getStart(graphNode.source),
            end: site.getEnd(),
            expression: site.getText(graphNode.source),
            controlPath: executionControlPath(site, graphNode.declaration),
          }
          const existing = edges.get(target)
          if (existing === undefined || candidate.offset < existing.offset) edges.set(target, candidate)
        }
      }
    }
    function visit(node) {
      if (ts.isPropertyAssignment(node)
        && ((ts.isIdentifier(node.name) && node.name.text === 'handler')
          || (ts.isStringLiteralLike(node.name) && node.name.text === 'handler'))) {
        addSymbolEdge(node.initializer, 'call')
      }
      if (ts.isCallExpression(node)) {
        const consequenceName = consequenceCallName(node)
        const registrarDefinition = ts.isVariableDeclaration(graphNode.declaration)
          && graphNode.declaration.initializer === node
          && consequenceName !== undefined
          && ALL_CONVEX_REGISTRARS.has(consequenceName)
        if (!registrarDefinition && consequenceName !== undefined && CONSEQUENCE_CALLS.has(consequenceName)) {
          effects.push({
            name: consequenceName,
            offset: node.getStart(graphNode.source),
            end: node.getEnd(),
            expression: node.expression.getText(graphNode.source),
            controlPath: executionControlPath(node, graphNode.declaration),
          })
        }
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
            const candidate = {
              target,
              via: 'function_reference',
              offset: node.getStart(graphNode.source),
              end: node.getEnd(),
              expression: node.getText(graphNode.source),
              controlPath: executionControlPath(node, graphNode.declaration),
            }
            const existing = edges.get(target)
            if (existing === undefined || candidate.offset < existing.offset) edges.set(target, candidate)
          }
        }
        if (ts.isPropertyAccessExpression(node.expression)
          && node.expression.name.text === 'handler') {
          for (const argument of node.arguments) addSymbolEdge(argument, 'call')
        }
        for (const argument of node.arguments) {
          for (const target of convexFunctionReferences(argument)) {
            if (nodes.has(target) && target !== graphNode.ref) {
              const candidate = {
                target,
                via: 'function_reference',
                offset: node.getStart(graphNode.source),
                end: node.getEnd(),
                expression: node.getText(graphNode.source),
                controlPath: executionControlPath(node, graphNode.declaration),
              }
              const existing = edges.get(target)
              if (existing === undefined || candidate.offset < existing.offset) edges.set(target, candidate)
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(graphNode.declaration)
    graphNode.edges = [...edges.values()]
      .sort((left, right) => left.target.localeCompare(right.target))
    graphNode.effects = effects.sort((left, right) => left.offset - right.offset)
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
    source,
    declaration,
    identity: {
      file,
      symbol,
      line: start.line + 1,
      column: start.character + 1,
      sha256: digest(text),
    },
    edges: [],
    effects: [],
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

function traceAuthorityPaths(graph, declarationRef, binding, surfaceRef = declarationRef) {
  const sinks = AUTHORITY_SINKS[binding]
  if (sinks === undefined) return []
  const queue = [{ ref: declarationRef, path: [] }]
  const seen = new Set()
  const candidates = []
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
      candidates.push({ authoritySink: current.ref, authorityPath: path })
      continue
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
  return candidates
}

function proveAuthorityDominatesConsequences(graph, row) {
  const authorityPath = row.authorityPath
  const hops = []
  for (let index = 0; index < authorityPath.length - 1; index += 1) {
    const current = authorityPath[index]
    const next = authorityPath[index + 1]
    const node = graph.get(index === 0 ? `${row.file}:${row.symbol}` : current.ref)
    if (node === undefined) {
      return { status: 'red', reason: `runtime_handler_identity_missing:${current.ref}` }
    }
    const edge = node.edges.find((candidate) => candidate.target === next.ref)
    if (edge === undefined) {
      return { status: 'red', reason: `authority_edge_missing:${current.ref}=>${next.ref}` }
    }
    const bypasses = node.effects.filter((effect) => {
      if (effect.offset === edge.offset && effect.end === edge.end) return false
      const dispatchIsIndependentlyGuarded = node.edges.some((candidate) => (
        candidate.offset >= effect.offset
        && candidate.end <= effect.end
        && AUTHORITY_SINKS[row.binding]?.some((sink) => graphReaches(graph, candidate.target, sink))
      ))
      if (dispatchIsIndependentlyGuarded) return false
      if (effect.offset >= edge.offset && controlPathDominates(edge.controlPath, effect.controlPath)) return false
      return true
    })
    if (bypasses.length > 0) {
      return {
        status: 'red',
        reason: `pre_sink_consequence:${current.ref}:${bypasses[0].name}`,
        bypasses: bypasses.map(({ name, expression, offset }) => ({ name, expression, offset })),
      }
    }
    hops.push(Object.freeze({
      from: current.ref,
      to: next.ref,
      via: edge.via,
      callSiteSha256: digest(`${edge.expression}\n${edge.offset}:${edge.end}`),
      consequencePrimitiveCount: node.effects.length,
    }))
  }
  return Object.freeze({
    status: 'proved',
    method: 'ordered_recursive_authority_dominance:v1',
    hops: Object.freeze(hops),
    sha256: digest(JSON.stringify(hops)),
  })
}

function graphReaches(graph, from, target) {
  const queue = [from]
  const seen = new Set()
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === target) return true
    if (seen.has(current)) continue
    seen.add(current)
    for (const edge of graph.get(current)?.edges ?? []) queue.push(edge.target)
  }
  return false
}

function verifiedExemption(graph, input, declared) {
  const proof = declared.exemption
  if (typeof proof !== 'object' || proof === null) return undefined
  const { testFile, testName, testSymbol = input.symbol } = proof
  if (typeof testFile !== 'string' || typeof testName !== 'string'
    || typeof testSymbol !== 'string'
    || testFile === INVENTORY_TEST
    || !/^tests\/.+\.test\.ts$/u.test(testFile)
    || !existsSync(resolve(ROOT, testFile))) return undefined
  const testEntrypointRef = `${input.file}:${testSymbol}`
  if (testSymbol !== input.symbol
    && (!graph.has(testEntrypointRef) || !graphReaches(graph, testEntrypointRef, input.declarationRef))) return undefined
  const source = readFileSync(resolve(ROOT, testFile), 'utf8')
  if (!behaviorTestProvesSymbol(source, testFile, testName, testSymbol)) return undefined
  return Object.freeze({ testFile, testName, sourceRef: input.ref, sha256: digest(source) })
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
    const exemption = verifiedExemption(graph, input, declared)
    return exemption === undefined
      ? { ...base, status: 'blocked', marker: `missing_tested_exemption:${input.ref}`, blocker: {
          code: 'missing_tested_exemption',
          detail: 'No independent existing behavior test proves this public/system exemption.',
        } }
      : { ...base, status: 'bound', marker: `tested_exemption:${exemption.testFile}:${exemption.testName}`, exemption }
  }
  const authorities = traceAuthorityPaths(graph, input.declarationRef, declared.binding, input.ref)
  const authority = authorities.find((candidate) => proveAuthorityDominatesConsequences(graph, {
    ...input,
    binding: declared.binding,
    ...candidate,
  }).status === 'proved') ?? authorities[0]
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

function sourceAst(path) {
  const source = readFileSync(resolve(ROOT, path), 'utf8')
  return {
    source,
    ast: ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true),
  }
}

function functionReferenceAliases(ast) {
  const aliases = new Map()
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue
      let resolved
      function visit(node) {
        if (resolved !== undefined || !ts.isCallExpression(node) || !ts.isIdentifier(node.expression)
          || !FUNCTION_REFERENCE_FACTORIES.has(node.expression.text) || node.arguments[0] === undefined
          || !ts.isStringLiteralLike(node.arguments[0])) {
          if (resolved === undefined) ts.forEachChild(node, visit)
          return
        }
        resolved = sourceFunctionReference(node.arguments[0].text)
      }
      visit(declaration.initializer)
      if (resolved !== undefined) aliases.set(declaration.name.text, resolved)
    }
  }
  return aliases
}

function targetFromExpression(node, aliases) {
  const direct = convexFunctionReferences(node)[0]
  if (direct !== undefined) return direct
  let current = node
  while (ts.isAsExpression(current) || ts.isParenthesizedExpression(current)) current = current.expression
  return ts.isIdentifier(current) ? aliases.get(current.text) : undefined
}

function enclosingDeclaration(node, path, ast) {
  let current = node
  while (current !== undefined && !ts.isSourceFile(current)) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)
      && ts.isVariableDeclarationList(current.parent)
      && ts.isVariableStatement(current.parent.parent)
      && ts.isSourceFile(current.parent.parent.parent)) {
      return { path, symbol: current.name.text, declarationRef: `${path}:${current.name.text}` }
    }
    if (ts.isFunctionDeclaration(current) && current.name !== undefined && ts.isSourceFile(current.parent)) {
      return { path, symbol: current.name.text, declarationRef: `${path}:${current.name.text}` }
    }
    current = current.parent
  }
  const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1
  throw new Error(`protected_surface_enclosing_declaration_missing:${path}:${line}`)
}

function callSite(path, ast, node, expression) {
  const location = ast.getLineAndCharacterOfPosition(node.getStart(ast))
  return Object.freeze({
    file: path,
    line: location.line + 1,
    column: location.character + 1,
    expression: expression.getText(ast),
  })
}

function addDiscoveredFamily(rows, kind, target, site, fallback) {
  const declaration = target === undefined ? fallback : {
    path: target.slice(0, target.lastIndexOf(':')),
    symbol: target.slice(target.lastIndexOf(':') + 1),
    declarationRef: target,
  }
  const ref = `${kind}:${target ?? fallback.declarationRef}`
  const existing = rows.get(ref)
  if (existing === undefined) {
    rows.set(ref, { ref, discoveryKind: kind, ...declaration, callSites: [site] })
  } else {
    existing.callSites.push(site)
  }
}

function discoverBackgroundFamilies() {
  const rows = new Map()
  for (const path of filesUnder('convex')) {
    const { ast } = sourceAst(path)
    const aliases = functionReferenceAliases(ast)
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text
        if ((method === 'runAfter' || method === 'runAt')
          && ts.isPropertyAccessExpression(node.expression.expression)
          && node.expression.expression.name.text === 'scheduler') {
          const fallback = enclosingDeclaration(node, path, ast)
          const site = callSite(path, ast, node, node.expression)
          addDiscoveredFamily(rows, 'scheduler', node.arguments[1] === undefined
            ? undefined : targetFromExpression(node.arguments[1], aliases), site, fallback)
        }
        if (method === 'runAction') {
          const fallback = enclosingDeclaration(node, path, ast)
          const site = callSite(path, ast, node, node.expression)
          addDiscoveredFamily(rows, 'run_action', node.arguments[0] === undefined
            ? undefined : targetFromExpression(node.arguments[0], aliases), site, fallback)
        }
        if (method === 'enqueueAction') {
          const fallback = enclosingDeclaration(node, path, ast)
          const site = callSite(path, ast, node, node.expression)
          addDiscoveredFamily(rows, 'workpool', node.arguments[1] === undefined
            ? undefined : targetFromExpression(node.arguments[1], aliases), site, fallback)
          const options = node.arguments[3]
          if (options !== undefined && ts.isObjectLiteralExpression(options)) {
            const completion = options.properties.find((property) => ts.isPropertyAssignment(property)
              && property.name.getText(ast) === 'onComplete')
            if (completion !== undefined && ts.isPropertyAssignment(completion)) {
              addDiscoveredFamily(rows, 'continuation', targetFromExpression(completion.initializer, aliases), site, fallback)
            }
          }
        }
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && (node.expression.text === 'runAdmittedAction' || node.expression.text === 'runAdmittedMutation')) {
        const fallback = enclosingDeclaration(node, path, ast)
        const site = callSite(path, ast, node, node.expression)
        addDiscoveredFamily(rows, 'job', node.arguments[2] === undefined
          ? undefined : targetFromExpression(node.arguments[2], aliases), site, fallback)
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)

    for (const statement of ast.statements) {
      if (!ts.isVariableStatement(statement) || !exported(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined
          || !/^reconcil/u.test(declaration.name.text)) continue
        const registrar = directRegistrar(declaration.initializer)
        if (registrar === null || !ALL_CONVEX_REGISTRARS.has(registrar)) continue
        const site = callSite(path, ast, declaration, declaration.name)
        addDiscoveredFamily(rows, 'reconciliation', `${path}:${declaration.name.text}`, site, {
          path,
          symbol: declaration.name.text,
          declarationRef: `${path}:${declaration.name.text}`,
        })
      }
    }
  }

  for (const path of filesUnder('src').filter((candidate) => /reconcil/u.test(candidate))) {
    const { ast } = sourceAst(path)
    for (const statement of ast.statements) {
      if (!ts.isVariableStatement(statement) || !exported(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'Route') continue
        const site = callSite(path, ast, declaration, declaration.name)
        addDiscoveredFamily(rows, 'reconciliation', `${path}:Route`, site, {
          path,
          symbol: 'Route',
          declarationRef: `${path}:Route`,
        })
      }
    }
  }
  return [...rows.values()].sort((left, right) => left.ref.localeCompare(right.ref))
}

function localImportMap(ast, path) {
  const imports = new Map()
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)
      || !statement.moduleSpecifier.text.startsWith('./')) continue
    const clause = statement.importClause?.namedBindings
    if (clause === undefined || !ts.isNamedImports(clause)) continue
    const module = statement.moduleSpecifier.text.replace(/^\.\//u, '')
    const targetPath = `${path.slice(0, path.lastIndexOf('/') + 1)}${module}.ts`
    for (const element of clause.elements) {
      imports.set(element.name.text, {
        path: targetPath,
        symbol: element.propertyName?.text ?? element.name.text,
      })
    }
  }
  return imports
}

function discoverConvexHttpRoutes() {
  const path = 'convex/http.ts'
  const { ast } = sourceAst(path)
  const imports = localImportMap(ast, path)
  const rows = []
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'http'
      && node.expression.name.text === 'route' && node.arguments[0] !== undefined
      && ts.isObjectLiteralExpression(node.arguments[0])) {
      const fields = Object.fromEntries(node.arguments[0].properties.flatMap((property) =>
        ts.isPropertyAssignment(property) ? [[property.name.getText(ast), property.initializer]] : []))
      const routePath = fields.path
      const method = fields.method
      const handler = fields.handler
      if (!ts.isStringLiteralLike(routePath) || !ts.isStringLiteralLike(method) || !ts.isIdentifier(handler)) {
        const location = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1
        throw new Error(`protected_surface_http_route_invalid:${path}:${location}`)
      }
      const target = imports.get(handler.text)
      if (target === undefined) throw new Error(`protected_surface_http_handler_unresolved:${handler.text}`)
      rows.push({
        ref: `convex_http_route:${method.text} ${routePath.text}`,
        path: target.path,
        symbol: target.symbol,
        declarationRef: `${target.path}:${target.symbol}`,
        handlerRef: `${target.path}:${target.symbol}`,
        method: method.text,
        routePath: routePath.text,
        callSites: [callSite(path, ast, node, node.expression)],
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return rows.sort((left, right) => left.ref.localeCompare(right.ref))
}

function discoverCrons() {
  const path = 'convex/crons.ts'
  const { ast } = sourceAst(path)
  const rows = []
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'crons'
      && (node.expression.name.text === 'interval' || node.expression.name.text === 'cron')) {
      const name = node.arguments[0]
      const targetNode = node.arguments[2]
      if (!ts.isStringLiteralLike(name) || targetNode === undefined) {
        const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1
        throw new Error(`protected_surface_cron_invalid:${path}:${line}`)
      }
      const target = targetFromExpression(targetNode, new Map())
      if (target === undefined) throw new Error(`protected_surface_cron_target_unresolved:${name.text}`)
      rows.push({
        ref: `cron:${name.text}`,
        path: target.slice(0, target.lastIndexOf(':')),
        symbol: target.slice(target.lastIndexOf(':') + 1),
        declarationRef: target,
        registrar: node.expression.name.text,
        callSites: [callSite(path, ast, node, node.expression)],
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return rows.sort((left, right) => left.ref.localeCompare(right.ref))
}

function discoverCallbackFamilies(convexHttpRoutes) {
  const rows = convexHttpRoutes.filter((row) => row.routePath.startsWith('/internal/')).map((row) => ({
    ref: `callback:${row.handlerRef}`,
    discoveryKind: 'callback',
    path: row.path,
    symbol: row.symbol,
    declarationRef: row.declarationRef,
    callSites: row.callSites,
  }))
  for (const path of filesUnder('src').filter((candidate) => /(?:callback|webhook)/u.test(candidate))) {
    const { ast } = sourceAst(path)
    for (const statement of ast.statements) {
      if (!ts.isVariableStatement(statement) || !exported(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'Route') continue
        rows.push({
          ref: `callback:${path}:Route`,
          discoveryKind: 'callback',
          path,
          symbol: 'Route',
          declarationRef: `${path}:Route`,
          callSites: [callSite(path, ast, declaration, declaration.name)],
        })
      }
    }
  }
  return rows.sort((left, right) => left.ref.localeCompare(right.ref))
}

export function discoverProtectedSurfaceRefs() {
  const serverFunctions = []
  const publicConvex = []
  const convexHttpActions = []
  for (const directory of ['src', 'convex']) {
    for (const path of filesUnder(directory)) {
      const { ast } = sourceAst(path)
      for (const statement of ast.statements) {
        if (!ts.isVariableStatement(statement)) continue
        for (const declaration of statement.declarationList.declarations) {
          if (declaration.initializer === undefined || !ts.isIdentifier(declaration.name)) continue
          if (directory === 'src' && containsRegistrar(declaration.initializer, 'createServerFn')) {
            serverFunctions.push({ ref: `${path}:${declaration.name.text}`, path, symbol: declaration.name.text })
          }
          if (directory === 'convex' && exported(statement)) {
            const registrar = directRegistrar(declaration.initializer)
            if (registrar !== null && PUBLIC_CONVEX_REGISTRARS.has(registrar)) {
              publicConvex.push({ ref: `${path}:${declaration.name.text}`, path, symbol: declaration.name.text, registrar })
            }
            if (registrar !== null && CONVEX_HTTP_REGISTRARS.has(registrar)) {
              convexHttpActions.push({ ref: `${path}:${declaration.name.text}`, path, symbol: declaration.name.text, registrar })
            }
          }
        }
      }
    }
  }
  const convexHttpRoutes = discoverConvexHttpRoutes()
  const backgroundFamilies = [...discoverBackgroundFamilies(), ...discoverCallbackFamilies(convexHttpRoutes)]
    .sort((left, right) => left.ref.localeCompare(right.ref))
  return {
    serverFunctions: serverFunctions.sort((left, right) => left.ref.localeCompare(right.ref)),
    publicConvex: publicConvex.sort((left, right) => left.ref.localeCompare(right.ref)),
    convexHttpActions: convexHttpActions.sort((left, right) => left.ref.localeCompare(right.ref)),
    convexHttpRoutes,
    crons: discoverCrons(),
    backgroundFamilies,
  }
}

export function collectProtectedSurfaces() {
  const classifications = classificationMap()
  const graph = createSourceGraph()
  const discovered = discoverProtectedSurfaceRefs()
  const frozenSource = readFileSync(resolve(ROOT, '.planning/maturity-execution/contracts/public-surface-inventory.json'), 'utf8')
  const frozenInventory = JSON.parse(frozenSource)
  const serverFunctions = discovered.serverFunctions.map(({ ref, path, symbol }) => evaluateSurface(
    graph,
    surfaceInput(graph, ref, 'server_function', path, symbol, 'createServerFn'),
    classification(ref, classifications),
  ))
  const publicConvex = discovered.publicConvex.map(({ ref, path, symbol, registrar }) => evaluateSurface(
    graph,
    surfaceInput(graph, ref, 'convex_public', path, symbol, registrar),
    classification(ref, classifications),
  ))
  const convexHttpActions = discovered.convexHttpActions.map(({ ref, path, symbol, registrar }) => evaluateSurface(
    graph,
    surfaceInput(graph, ref, 'http', path, symbol, registrar),
    classification(ref, classifications),
  ))
  const convexHttpRoutes = discovered.convexHttpRoutes.map((input) => Object.assign(evaluateSurface(
    graph,
    surfaceInput(graph, input.ref, 'http', input.path, input.symbol, 'http.route'),
    classification(input.ref, classifications),
  ), {
    handlerRef: input.handlerRef,
    method: input.method,
    routePath: input.routePath,
    callSites: input.callSites,
  }))
  const backgroundFamilies = discovered.backgroundFamilies.map((input) => Object.assign(evaluateSurface(
    graph,
    surfaceInput(
      graph,
      input.ref,
      input.discoveryKind === 'continuation' ? 'continuation'
        : input.discoveryKind === 'reconciliation' ? 'reconciliation'
          : input.discoveryKind === 'scheduler' || input.discoveryKind === 'job' ? 'job'
            : input.discoveryKind === 'callback' ? 'callback' : 'worker',
      input.path,
      input.symbol,
      input.discoveryKind,
    ),
    classification(input.ref, classifications),
  ), { discoveryKind: input.discoveryKind, callSites: input.callSites }))

  const crons = discovered.crons.map((input) => {
      const { ref, path, symbol } = input
      const declared = classification(ref, classifications)
      if (declared.binding !== 'workload_account') throw new Error(`protected_surface_classification_conflict:${ref}`)
      return Object.assign(evaluateSurface(
        graph,
        surfaceInput(graph, ref, 'cron', path, symbol, input.registrar),
        declared,
      ), { callSites: input.callSites })
    })

  const sort = (rows) => rows.sort((left, right) => left.ref.localeCompare(right.ref))
  const inventory = {
    format: 'phase-2-protected-surfaces:v2',
    expectedCounts: BASELINE_COUNTS,
    baselineCounts: BASELINE_COUNTS,
    actualCounts: {
      serverFunctions: serverFunctions.length,
      publicConvex: publicConvex.length,
      convexHttpActions: convexHttpActions.length,
      convexHttpRoutes: convexHttpRoutes.length,
      crons: crons.length,
      backgroundFamilies: backgroundFamilies.length,
      frozenHttp: frozenInventory.http?.length,
      frozenMcp: frozenInventory.mcp?.length,
      frozenCli: frozenInventory.cli?.length,
    },
    candidateCounts: {
      serverFunctions: serverFunctions.length,
      publicConvex: publicConvex.length,
      convexHttpActions: convexHttpActions.length,
      convexHttpRoutes: convexHttpRoutes.length,
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
    convexHttpRoutes: sort(convexHttpRoutes),
    crons: sort(crons),
    backgroundFamilies: sort(backgroundFamilies),
    backgroundDiscovery: {
      discoveryKinds: [...new Set(backgroundFamilies.map((row) => row.discoveryKind))].sort(),
      callSiteCount: backgroundFamilies.reduce((count, row) => count + row.callSites.length, 0),
    },
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
    ...inventory.convexHttpRoutes,
    ...inventory.crons,
    ...inventory.backgroundFamilies,
  ]
}

export function auditProtectedSurfaceDominance(inventory = collectProtectedSurfaces()) {
  const graph = createSourceGraph()
  const rows = allRows(inventory).map((row) => row.authorityPath === undefined
    ? Object.freeze({
        surfaceRef: row.ref,
        runtimeHandlerRef: `${row.file}:${row.symbol}`,
        status: 'tested_exemption',
        testFile: row.exemption?.testFile,
        testName: row.exemption?.testName,
      })
    : Object.freeze({
        surfaceRef: row.ref,
        runtimeHandlerRef: `${row.file}:${row.symbol}`,
        authoritySink: row.authoritySink,
        authorityPathSha256: digest(JSON.stringify(row.authorityPath)),
        dominance: proveAuthorityDominatesConsequences(graph, row),
      }))
  return Object.freeze({
    format: 'phase-2-surface-authority-dominance-audit:v1',
    total: rows.length,
    protected: rows.filter((row) => row.dominance !== undefined).length,
    proved: rows.filter((row) => row.dominance?.status === 'proved').length,
    red: rows.filter((row) => row.dominance?.status === 'red').length,
    exemptions: rows.filter((row) => row.status === 'tested_exemption').length,
    rows: Object.freeze(rows),
  })
}

export function validateProtectedSurfaceInventory(inventory) {
  if (inventory.format !== 'phase-2-protected-surfaces:v2'
    || JSON.stringify(inventory.expectedCounts) !== JSON.stringify(BASELINE_COUNTS)
    || JSON.stringify(inventory.baselineCounts) !== JSON.stringify(BASELINE_COUNTS)
    || JSON.stringify(inventory.actualCounts) !== JSON.stringify(inventory.candidateCounts)
    || inventory.serverFunctions.length !== inventory.candidateCounts?.serverFunctions
    || inventory.publicConvex.length !== inventory.candidateCounts?.publicConvex
    || inventory.convexHttpActions.length !== inventory.candidateCounts?.convexHttpActions
    || inventory.convexHttpRoutes.length !== inventory.candidateCounts?.convexHttpRoutes
    || inventory.crons.length !== inventory.candidateCounts?.crons
    || inventory.backgroundFamilies.length !== inventory.candidateCounts?.backgroundFamilies
    || inventory.frozenContract?.sourceFile !== '.planning/maturity-execution/contracts/public-surface-inventory.json'
    || !/^[a-f0-9]{64}$/u.test(inventory.frozenContract?.sha256 ?? '')
    || inventory.frozenContract?.httpRefs?.length !== BASELINE_COUNTS.frozenHttp
    || inventory.frozenContract?.mcpRefs?.length !== BASELINE_COUNTS.frozenMcp
    || inventory.frozenContract?.cliRefs?.length !== BASELINE_COUNTS.frozenCli
    || new Set(inventory.frozenContract?.httpRefs).size !== BASELINE_COUNTS.frozenHttp
    || new Set(inventory.frozenContract?.mcpRefs).size !== BASELINE_COUNTS.frozenMcp
    || new Set(inventory.frozenContract?.cliRefs).size !== BASELINE_COUNTS.frozenCli) {
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
  for (const row of [...inventory.convexHttpRoutes, ...inventory.crons, ...inventory.backgroundFamilies]) {
    if (!Array.isArray(row.callSites) || row.callSites.length === 0
      || row.callSites.some((site) => typeof site.file !== 'string' || site.file.length === 0
        || !Number.isInteger(site.line) || site.line < 1
        || !Number.isInteger(site.column) || site.column < 1
        || typeof site.expression !== 'string' || site.expression.length === 0)) {
      throw new Error(`protected_surface_call_sites_invalid:${row.ref}`)
    }
  }
  const discoveryKinds = [...new Set(inventory.backgroundFamilies.map((row) => row.discoveryKind))].sort()
  if (JSON.stringify(inventory.backgroundDiscovery?.discoveryKinds) !== JSON.stringify(discoveryKinds)
    || inventory.backgroundDiscovery?.callSiteCount !== inventory.backgroundFamilies
      .reduce((count, row) => count + row.callSites.length, 0)) {
    throw new Error('protected_surface_background_discovery_invalid')
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

function runtimeTestCase(source, file, testName) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const matches = []
  function visit(node) {
    const directTest = ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && (node.expression.text === 'it' || node.expression.text === 'test')
    const tableTest = ts.isCallExpression(node) && ts.isCallExpression(node.expression)
      && ts.isPropertyAccessExpression(node.expression.expression)
      && ts.isIdentifier(node.expression.expression.expression)
      && (node.expression.expression.expression.text === 'it'
        || node.expression.expression.expression.text === 'test')
      && node.expression.expression.name.text === 'each'
    if ((directTest || tableTest)
      && node.arguments[0] !== undefined && ts.isStringLiteralLike(node.arguments[0])
      && node.arguments[0].text === testName && node.arguments[1] !== undefined) {
      matches.push({
        behavior: node.arguments[1],
        table: tableTest ? node.expression.arguments[0] : undefined,
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return matches.length === 1 ? { ast, ...matches[0] } : undefined
}

function runtimeIsolationCaseLabels(source, file, testName) {
  const testCase = runtimeTestCase(source, file, testName)
  if (testCase?.table === undefined) return undefined
  const declarations = new Map()
  for (const statement of testCase.ast.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer !== undefined) {
        declarations.set(declaration.name.text, declaration.initializer)
      }
    }
  }
  function unwrap(node, seen = new Set()) {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
      || ts.isSatisfiesExpression(node)) return unwrap(node.expression, seen)
    if (ts.isIdentifier(node)) {
      const declaration = declarations.get(node.text)
      if (declaration === undefined || seen.has(node.text)) return node
      seen.add(node.text)
      return unwrap(declaration, seen)
    }
    return node
  }
  const table = unwrap(testCase.table)
  if (!ts.isArrayLiteralExpression(table)) return undefined
  const labels = table.elements.map((element) => {
    const value = unwrap(element)
    if (ts.isStringLiteralLike(value)) return value.text
    if (!ts.isArrayLiteralExpression(value) || value.elements[0] === undefined) return undefined
    const label = unwrap(value.elements[0])
    return ts.isStringLiteralLike(label) ? label.text : undefined
  })
  return labels.every((label) => label !== undefined) ? labels : undefined
}

function normalizedModulePath(testFile, specifier) {
  let path
  if (specifier.startsWith('@/')) path = `src/${specifier.slice(2)}`
  else if (specifier.startsWith('.')) path = projectPath(resolve(ROOT, dirname(testFile), specifier))
  else return undefined
  return path.replace(/\.(?:tsx?|jsx?)$/u, '').replace(/\/index$/u, '')
}

function runtimeInvocationProof(source, testFile, testName, surface) {
  const testCase = runtimeTestCase(source, testFile, testName)
  if (testCase === undefined) return undefined
  const { ast, behavior } = testCase
  const targetFile = surface.file.replace(/\.(?:tsx?|jsx?)$/u, '').replace(/\/index$/u, '')
  const targetRef = `${surface.file}:${surface.symbol}`
  const targetConvexRef = surface.file.startsWith('convex/')
    ? `${surface.file.slice('convex/'.length).replace(/\.ts$/u, '')}:${surface.symbol}`
    : undefined
  const imports = new Map()
  const declarations = new Map()
  for (const statement of ast.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier)) {
      const modulePath = normalizedModulePath(testFile, statement.moduleSpecifier.text)
      const clause = statement.importClause
      if (modulePath !== undefined && clause?.name !== undefined) {
        imports.set(clause.name.text, { imported: 'default', modulePath })
      }
      if (modulePath !== undefined && clause?.namedBindings !== undefined
        && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          imports.set(element.name.text, {
            imported: element.propertyName?.text ?? element.name.text,
            modulePath,
          })
        }
      }
    }
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      declarations.set(statement.name.text, statement)
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration)
      }
    }
  }
  const visitedDeclarations = new Set()
  let proof
  function record(kind, expression) {
    proof ??= { kind, target: targetRef, expression }
  }
  function importedTarget(identifier) {
    const binding = imports.get(identifier.text)
    return binding?.modulePath === targetFile && binding.imported === surface.symbol
  }
  function importedHandlerAlias(identifier) {
    const declaration = declarations.get(identifier.text)
    if (declaration === undefined || !ts.isVariableDeclaration(declaration)
      || declaration.initializer === undefined) return false
    function unwrap(node) {
      let current = node
      while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)) current = current.expression
      return current
    }
    function importedRouteHandler(node) {
      const parts = []
      let current = unwrap(node)
      while (ts.isPropertyAccessExpression(current)) {
        parts.unshift(current.name.text)
        current = unwrap(current.expression)
      }
      return ts.isIdentifier(current)
        && importedTarget(current)
        && parts.join('.') === 'options.server.handlers.POST'
    }
    function resolves(node, seen = new Set()) {
      const current = unwrap(node)
      if (importedRouteHandler(current)) return true
      if (ts.isIdentifier(current)) {
        if (importedTarget(current)) return true
        const alias = declarations.get(current.text)
        if (alias === undefined || !ts.isVariableDeclaration(alias)
          || alias.initializer === undefined || seen.has(alias)) return false
        seen.add(alias)
        return resolves(alias.initializer, seen)
      }
      return ts.isPropertyAccessExpression(current) && current.name.text === '_handler'
        && resolves(current.expression, seen)
    }
    return resolves(declaration.initializer)
  }
  function convexReference(node) {
    if (targetConvexRef === undefined) return false
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'makeFunctionReference'
      && node.arguments[0] !== undefined && ts.isStringLiteralLike(node.arguments[0])
      && node.arguments[0].text === targetConvexRef) return true
    if (!ts.isPropertyAccessExpression(node)) return false
    const parts = []
    let cursor = node
    while (ts.isPropertyAccessExpression(cursor)) {
      parts.unshift(cursor.name.text)
      cursor = cursor.expression
    }
    if (!ts.isIdentifier(cursor)
      || (cursor.text !== 'api' && cursor.text !== 'internal' && cursor.text !== 'anyApi')) return false
    return `${parts.slice(0, -1).join('/')}:${parts.at(-1)}` === targetConvexRef
  }
  function convexReferenceExpression(node, seen = new Set()) {
    let current = node
    while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)) current = current.expression
    if (convexReference(current)) return current.getText(ast)
    if (!ts.isIdentifier(current)) return undefined
    const declaration = declarations.get(current.text)
    if (declaration === undefined || !ts.isVariableDeclaration(declaration) || declaration.initializer === undefined
      || seen.has(declaration)) return undefined
    seen.add(declaration)
    return convexReferenceExpression(declaration.initializer, seen)
  }
  function visit(node) {
    if (proof !== undefined) return
    if (ts.isCallExpression(node)) {
      let callee = node.expression
      while (ts.isParenthesizedExpression(callee) || ts.isAsExpression(callee)) callee = callee.expression
      const runtimeMethod = ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined
      const referenceIndex = runtimeMethod === 'runAfter' || runtimeMethod === 'runAt' ? 1 : 0
      if (runtimeMethod !== undefined && new Set([
        'action', 'mutation', 'query', 'runAction', 'runMutation', 'runQuery', 'runAfter', 'runAt',
      ]).has(runtimeMethod)) {
        const expression = node.arguments[referenceIndex] === undefined
          ? undefined
          : convexReferenceExpression(node.arguments[referenceIndex])
        if (expression !== undefined) record('convex_runtime_invocation', expression)
      }
      if (ts.isIdentifier(callee) && importedTarget(callee)) {
        record('imported_handler_call', node.expression.getText(ast))
      } else if (ts.isIdentifier(callee) && importedHandlerAlias(callee)) {
        record('registered_handler_call', node.expression.getText(ast))
      } else if (ts.isPropertyAccessExpression(callee) && callee.name.text === '_handler'
        && ts.isIdentifier(callee.expression)
        && (importedTarget(callee.expression) || importedHandlerAlias(callee.expression))) {
        record('registered_handler_call', node.expression.getText(ast))
      }
    }
    if (ts.isIdentifier(node)) {
      const declaration = declarations.get(node.text)
      if (declaration !== undefined && !visitedDeclarations.has(declaration)) {
        visitedDeclarations.add(declaration)
        visit(declaration)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(behavior)
  return proof
}

function runtimeTestChecksum(source, testFile, testName) {
  const testCase = runtimeTestCase(source, testFile, testName)
  return testCase === undefined ? undefined : digest(testCase.behavior.getText(testCase.ast))
}

function sinkRows(inventory) {
  return allRows(inventory).filter((row) => typeof row.authoritySink === 'string')
}

function buildSinkTestRegistry(inventory) {
  const rows = {}
  const surfaces = new Map(allRows(inventory).map((row) => [row.ref, row]))
  const sinks = [...new Set(sinkRows(inventory).map((row) => row.authoritySink))].sort()
  for (const sink of sinks) {
    const assignment = SINK_TEST_ASSIGNMENTS[sink]
    if (assignment === undefined) throw new Error(`protected_surface_sink_assignment_missing:${sink}`)
    if (assignment === null) {
      rows[sink] = {
        status: 'red',
        reason: 'No honest existing test invokes a registered runtime handler or composition that reaches this sink.',
      }
      continue
    }
    const [surfaceRef, testFile, testName] = assignment
    const surface = surfaces.get(surfaceRef)
    if (surface?.authoritySink !== sink || surface.consequential !== true) {
      throw new Error(`protected_surface_sink_assignment_surface_invalid:${sink}`)
    }
    const source = readFileSync(resolve(ROOT, testFile), 'utf8')
    const invocation = runtimeInvocationProof(source, testFile, testName, surface)
    if (invocation === undefined) {
      rows[sink] = {
        status: 'red',
        reason: 'The assigned test does not mechanically invoke the registered runtime surface that reaches this sink.',
      }
      continue
    }
    rows[sink] = {
      status: 'covered',
      surfaceRef,
      testFile,
      testName,
      checksumScope: 'named_test_case_ast',
      sha256: runtimeTestChecksum(source, testFile, testName),
      invocation,
      caseLabels: runtimeIsolationCaseLabels(source, testFile, testName),
      authorityPathSha256: digest(JSON.stringify(surface.authorityPath)),
    }
  }
  return {
    format: 'phase-2-authority-sink-runtime-tests:v2',
    inventorySha256: digest(`${JSON.stringify(inventory, null, 2)}\n`),
    rows,
  }
}

export function validateSinkTestRegistry(inventory, registry) {
  const expectedSinks = [...new Set(sinkRows(inventory).map((row) => row.authoritySink))].sort()
  if (registry?.format !== 'phase-2-authority-sink-runtime-tests:v2'
    || registry.inventorySha256 !== digest(`${JSON.stringify(inventory, null, 2)}\n`)
    || JSON.stringify(Object.keys(registry.rows ?? {}).sort()) !== JSON.stringify(expectedSinks)) {
    throw new Error('protected_surface_sink_registry_invalid')
  }
  const surfaces = new Map(allRows(inventory).map((row) => [row.ref, row]))
  for (const sink of expectedSinks) {
    const row = registry.rows[sink]
    if (row?.status === 'red') {
      if (typeof row.reason !== 'string' || row.reason.length < 20
        || Object.keys(row).sort().join(',') !== 'reason,status') {
        throw new Error(`protected_surface_sink_registry_red_invalid:${sink}`)
      }
      continue
    }
    if (row?.status !== 'covered' || surfaces.get(row.surfaceRef)?.authoritySink !== sink
      || surfaces.get(row.surfaceRef)?.consequential !== true
      || !/^tests\/.+\.test\.tsx?$/u.test(row.testFile ?? '')
      || typeof row.testName !== 'string' || !/^[a-f0-9]{64}$/u.test(row.sha256 ?? '')
      || row.checksumScope !== 'named_test_case_ast'
      || JSON.stringify(row.caseLabels) !== JSON.stringify(ISOLATION_CASE_LABELS)
      || !/^[a-f0-9]{64}$/u.test(row.authorityPathSha256 ?? '')) {
      throw new Error(`protected_surface_sink_registry_row_invalid:${sink}`)
    }
    const source = readFileSync(resolve(ROOT, row.testFile), 'utf8')
    const surface = surfaces.get(row.surfaceRef)
    const invocation = runtimeInvocationProof(source, row.testFile, row.testName, surface)
    if (runtimeTestChecksum(source, row.testFile, row.testName) !== row.sha256 || invocation === undefined
      || JSON.stringify(invocation) !== JSON.stringify(row.invocation)
      || JSON.stringify(runtimeIsolationCaseLabels(source, row.testFile, row.testName))
        !== JSON.stringify(ISOLATION_CASE_LABELS)
      || digest(JSON.stringify(surface.authorityPath)) !== row.authorityPathSha256) {
      throw new Error(`protected_surface_sink_registry_test_invalid:${sink}`)
    }
  }
  return registry
}

function writeSinkTestRegistry(inventory) {
  const registry = buildSinkTestRegistry(inventory)
  validateSinkTestRegistry(inventory, registry)
  writeFileSync(SINK_TEST_REGISTRY, `${JSON.stringify(registry, null, 2)}\n`)
  return registry
}

function checkSinkTestRegistry(inventory) {
  if (!existsSync(SINK_TEST_REGISTRY)) throw new Error('protected_surface_sink_registry_missing')
  const registry = validateSinkTestRegistry(
    inventory,
    JSON.parse(readFileSync(SINK_TEST_REGISTRY, 'utf8')),
  )
  if (JSON.stringify(registry) !== JSON.stringify(buildSinkTestRegistry(inventory))) {
    throw new Error('protected_surface_sink_registry_drift')
  }
  return registry
}

function buildSurfaceAuthorityMap(inventory, registry) {
  const redSink = Object.entries(registry.rows).find(([, row]) => row.status !== 'covered')
  if (redSink !== undefined) {
    throw new Error(`protected_surface_authority_map_runtime_red:${redSink[0]}`)
  }
  const audit = auditProtectedSurfaceDominance(inventory)
  const rows = audit.rows.map((row) => row.dominance === undefined
    ? row
    : Object.freeze({
        ...row,
        runtimeIsolation: Object.freeze({
          testFile: registry.rows[row.authoritySink].testFile,
          testName: registry.rows[row.authoritySink].testName,
          testSha256: registry.rows[row.authoritySink].sha256,
          caseLabels: Object.freeze([...registry.rows[row.authoritySink].caseLabels]),
        }),
      }))
  return Object.freeze({
    format: 'phase-2-surface-authority-map:v1',
    inventorySha256: digest(`${JSON.stringify(inventory, null, 2)}\n`),
    total: audit.total,
    protected: audit.protected,
    exemptions: audit.exemptions,
    proved: audit.proved,
    red: audit.red,
    rows: Object.freeze(rows),
  })
}

function writeSurfaceAuthorityMap(inventory, registry) {
  const map = buildSurfaceAuthorityMap(inventory, registry)
  if (map.red !== 0 || map.total !== 242 || map.protected + map.exemptions !== map.total) {
    throw new Error('protected_surface_authority_map_red')
  }
  writeFileSync(SURFACE_AUTHORITY_MAP, `${JSON.stringify(map, null, 2)}\n`)
  return map
}

function checkSurfaceAuthorityMap(inventory, registry) {
  if (!existsSync(SURFACE_AUTHORITY_MAP)) throw new Error('protected_surface_authority_map_missing')
  const expected = JSON.parse(readFileSync(SURFACE_AUTHORITY_MAP, 'utf8'))
  const actual = buildSurfaceAuthorityMap(inventory, registry)
  if (actual.red !== 0 || JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error('protected_surface_authority_map_drift')
  }
  return actual
}

export function writeProtectedSurfaceInventory(output = DEFAULT_OUTPUT, options = {}) {
  const inventory = collectProtectedSurfaces()
  writeFileSync(output, `${JSON.stringify(inventory, null, 2)}\n`)
  if (output === DEFAULT_OUTPUT && options.writeDerived !== false) {
    const registry = writeSinkTestRegistry(inventory)
    writeSurfaceAuthorityMap(inventory, registry)
  }
  return inventory
}

export function checkProtectedSurfaceInventory(output = DEFAULT_OUTPUT, options = {}) {
  if (!existsSync(output)) throw new Error('protected_surface_inventory_missing')
  const expected = JSON.parse(readFileSync(output, 'utf8'))
  validateProtectedSurfaceInventory(expected)
  const actual = collectProtectedSurfaces()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('protected_surface_inventory_drift')
  if (output === DEFAULT_OUTPUT && options.checkDerived !== false) {
    const registry = checkSinkTestRegistry(actual)
    checkSurfaceAuthorityMap(actual, registry)
  }
  return actual
}

function outputArgument(argv) {
  const index = argv.indexOf('--output')
  if (index === -1) return DEFAULT_OUTPUT
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error('protected_surface_output_argument_missing')
  return resolve(ROOT, value)
}

function registryArgument(argv) {
  const index = argv.indexOf('--registry')
  if (index === -1) return SINK_TEST_REGISTRY
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error('protected_surface_registry_argument_missing')
  return resolve(ROOT, value)
}

function writeStandardOutput(value) {
  return new Promise((resolveWrite, rejectWrite) => {
    process.stdout.write(value, (error) => {
      if (error === undefined || error === null) resolveWrite()
      else rejectWrite(error)
    })
  })
}

async function runCli() {
  if (process.argv.includes('--discover-refs')) {
    await writeStandardOutput(`${JSON.stringify(discoverProtectedSurfaceRefs(), null, 2)}\n`)
    return
  }
  if (process.argv.includes('--audit-dominance')) {
    const audit = auditProtectedSurfaceDominance()
    await writeStandardOutput(`${JSON.stringify(audit, null, 2)}\n`)
    if (process.argv.includes('--require-dominance') && audit.red > 0) process.exitCode = 1
    return
  }
  const output = outputArgument(process.argv)
  if (process.argv.includes('--validate-sink-registry')) {
    if (!existsSync(output)) throw new Error('protected_surface_inventory_missing')
    const inventory = validateProtectedSurfaceInventory(JSON.parse(readFileSync(output, 'utf8')))
    const registryPath = registryArgument(process.argv)
    if (!existsSync(registryPath)) throw new Error('protected_surface_sink_registry_missing')
    const registry = validateSinkTestRegistry(
      inventory,
      JSON.parse(readFileSync(registryPath, 'utf8')),
    )
    const redSinks = Object.entries(registry.rows)
      .filter(([, row]) => row.status === 'red').map(([sink]) => sink)
    await writeStandardOutput(`${JSON.stringify({
      validated: true,
      total: Object.keys(registry.rows).length,
      covered: Object.keys(registry.rows).length - redSinks.length,
      red: redSinks.length,
      redSinks,
    })}\n`)
    if (process.argv.includes('--require-runtime-tests') && redSinks.length > 0) process.exitCode = 1
    return
  }
  if (process.argv.includes('--write-legacy-sink-registry')) {
    if (!existsSync(output)) throw new Error('protected_surface_inventory_missing')
    const inventory = validateProtectedSurfaceInventory(JSON.parse(readFileSync(output, 'utf8')))
    const registry = writeSinkTestRegistry(inventory)
    await writeStandardOutput(`${JSON.stringify({
      analysisScope: 'legacy_sink_reference_only',
      sinks: Object.keys(registry.rows).length,
      registrySha256: digest(`${JSON.stringify(registry, null, 2)}\n`),
    })}\n`)
    return
  }
  if (process.argv.includes('--validate-only')) {
    if (!existsSync(output)) throw new Error('protected_surface_inventory_missing')
    const inventory = validateProtectedSurfaceInventory(JSON.parse(readFileSync(output, 'utf8')))
    if (process.argv.includes('--require-bound')
      && allRows(inventory).some((row) => row.status === 'blocked')) {
      throw new Error('protected_surface_unbound')
    }
    await writeStandardOutput('{"validated":true}\n')
    return
  }
  const snapshotOnly = process.argv.includes('--check-snapshot')
  const check = process.argv.includes('--check') || snapshotOnly || process.argv.includes('--require-bound')
  const inventory = check
    ? checkProtectedSurfaceInventory(output, { checkDerived: !snapshotOnly })
    : writeProtectedSurfaceInventory(output, {
        writeDerived: !process.argv.includes('--inventory-snapshot-only'),
      })
  if (process.argv.includes('--inventory-snapshot-only') || snapshotOnly) {
    await writeStandardOutput(`${JSON.stringify({
      analysisScope: 'runtime_identity_only',
      counts: inventory.actualCounts,
      inventorySha256: digest(`${JSON.stringify(inventory, null, 2)}\n`),
      runAdmittedActionRefs: inventory.backgroundFamilies
        .map((row) => row.ref)
        .filter((ref) => ref.includes('runAdmittedAction')),
    }, null, 2)}\n`)
    return
  }
  const blocked = allRows(inventory).filter((row) => row.status === 'blocked')
  const sinkRegistry = output === DEFAULT_OUTPUT
    ? JSON.parse(readFileSync(SINK_TEST_REGISTRY, 'utf8'))
    : buildSinkTestRegistry(inventory)
  const redSinks = Object.entries(sinkRegistry.rows)
    .filter(([, row]) => row.status === 'red').map(([sink]) => sink)
  await writeStandardOutput(`${JSON.stringify({
    counts: inventory.actualCounts,
    bound: allRows(inventory).length - blocked.length,
    blocked: blocked.length,
    blockedByKind: inventory.blockedByKind,
    blockerRefs: blocked.map((row) => row.ref),
    runtimeSinkTests: {
      total: Object.keys(sinkRegistry.rows).length,
      covered: Object.keys(sinkRegistry.rows).length - redSinks.length,
      red: redSinks.length,
      redSinks,
    },
  }, null, 2)}\n`)
  if (process.argv.includes('--require-bound') && blocked.length > 0) process.exitCode = 1
  if (process.argv.includes('--require-runtime-tests') && redSinks.length > 0) process.exitCode = 1
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await runCli()
