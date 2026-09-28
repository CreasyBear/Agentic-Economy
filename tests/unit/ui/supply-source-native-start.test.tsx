// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeSupplySourceNativeStart } from '@/components/ae/supply/AeSupplySourceNativeStart'

afterEach(cleanup)

const candidate = {
  candidateRef: `sha256:${'a'.repeat(64)}`,
  sourceSelector: {
    serverUrl: 'https://provider.example/',
    path: '/lookup',
    method: 'post',
  },
  title: 'Reference lookup',
  description: 'Looks up one public reference.',
  inputSchema: { type: 'object', properties: { query: { type: 'string' }, 'path/~name': { type: 'string' } } },
  outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
  authentication: { kind: 'public' as const },
  validationExampleAvailable: true,
  disposition: { kind: 'supported' as const },
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const selectedOpenApiInitial = {
  source: {
    kind: 'openapi' as const,
    definitionUrl: 'https://provider.example/openapi.yaml',
    environment: 'sandbox' as const,
  },
  preview: {
    kind: 'ready' as const,
    sourceDigest: `sha256:${'b'.repeat(64)}`,
    sourceRevision: `openapi:sha256:${'b'.repeat(64)}`,
    provenance: {
      sourceKind: 'openapi' as const,
      sourceUrl: 'https://provider.example/openapi.yaml',
      authority: 'unverified_public' as const,
    },
    authentication: [{ kind: 'public' as const }],
    candidates: [candidate],
  },
  candidateRef: candidate.candidateRef,
}

describe('source-native Provider start', () => {
  it('hands the selected protected source directly to its durable connection ceremony', async () => {
    const protectedCandidate = {
      ...candidate,
      authentication: { kind: 'http_bearer' as const },
    }
    const onConnect = vi.fn().mockResolvedValue({
      kind: 'action_required',
      requiredAction: {
        action: 'supply.source.preview',
        blockedCapabilities: ['supply.publish'],
        cta: '/owner/supply/connections/new?attempt=pca_http',
        ctaLabel: 'Connect service',
        description: 'Enter the service credential securely, then AE will return to this Tool.',
        iconUrl: null,
        status: 'required',
        title: 'Connect service',
      },
    })
    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        initial={{
          source: {
            kind: 'openapi',
            definitionUrl: 'https://provider.example/openapi.yaml',
            environment: 'production',
          },
          preview: {
            kind: 'ready',
            sourceDigest: `sha256:${'b'.repeat(64)}`,
            sourceRevision: `openapi:sha256:${'b'.repeat(64)}`,
            provenance: {
              sourceKind: 'openapi',
              sourceUrl: 'https://provider.example/openapi.yaml',
              authority: 'unverified_public',
            },
            authentication: [{ kind: 'http_bearer' }],
            candidates: [protectedCandidate],
          },
          candidateRef: protectedCandidate.candidateRef,
        }}
        onPreview={vi.fn()}
        onConnect={onConnect}
        onSelectCandidate={vi.fn()}
        onPublish={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Connect service' }))
    const handoff = await screen.findByRole('link', { name: 'Connect service' })
    expect(handoff.getAttribute('href')).toBe('/owner/supply/connections/new?attempt=pca_http')
    expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({
      businessId: 'business:one',
      candidateRef: protectedCandidate.candidateRef,
      expectedSourceDigest: `sha256:${'b'.repeat(64)}`,
    }))
    expect(screen.queryByLabelText(/api key|bearer token|secret/i)).toBeNull()
  })

  it('hands a selected x402 source to the bounded workspace connection CTA', async () => {
    const x402Candidate = {
      candidateRef: `sha256:${'b'.repeat(64)}`,
      sourceSelector: { resourceUrl: 'https://seller.example/paid', method: 'POST' as const },
      title: 'Paid lookup',
      description: 'Looks up one paid reference.',
      authentication: { kind: 'x402_wallet' as const },
      validationExampleAvailable: false,
      disposition: { kind: 'supported' as const },
    }
    const onConnect = vi.fn().mockResolvedValue({
      kind: 'action_required',
      requiredAction: {
        action: 'supply.source.preview',
        blockedCapabilities: ['supply.publish'],
        cta: '/owner/settings/integrations?connect=x402',
        ctaLabel: 'Connect service',
        description: 'Inspect the exact x402 payment lane, prove payee control with your wallet, then AE will return to this Tool.',
        iconUrl: null,
        status: 'required',
        title: 'Connect service',
      },
    })
    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        initial={{
          source: { kind: 'x402', resourceUrl: 'https://seller.example/paid', method: 'POST', environment: 'sandbox' },
          preview: {
            kind: 'ready',
            sourceDigest: `sha256:${'c'.repeat(64)}`,
            sourceRevision: `x402:sha256:${'c'.repeat(64)}`,
            provenance: { sourceKind: 'x402', sourceUrl: 'https://seller.example/paid', authority: 'observed_external' },
            authentication: [{ kind: 'x402_wallet' }],
            candidates: [x402Candidate],
          },
          candidateRef: x402Candidate.candidateRef,
        }}
        onPreview={vi.fn()}
        onConnect={onConnect}
        onSelectCandidate={vi.fn()}
        onPublish={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Connect service' }))
    const handoff = await screen.findByRole('link', { name: 'Connect service' })
    expect(handoff.getAttribute('href')).toBe('/owner/settings/integrations?connect=x402')
    expect(onConnect).toHaveBeenCalledWith({
      businessId: 'business:one',
      source: { kind: 'x402', resourceUrl: 'https://seller.example/paid', method: 'POST', environment: 'sandbox' },
      expectedSourceDigest: `sha256:${'c'.repeat(64)}`,
      candidateRef: x402Candidate.candidateRef,
      idempotencyKey: expect.stringMatching(/^owner-supply-connection:/u),
    })
  })

  it('restores a selected source candidate after a browser refresh without repeating discovery', async () => {
    const onPreview = vi.fn()
    const onSelectCandidate = vi.fn()
    const onPublish = vi.fn()

    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        initial={{
          source: {
            kind: 'openapi',
            definitionUrl: 'https://provider.example/openapi.yaml',
            environment: 'production',
          },
          preview: {
            kind: 'ready',
            sourceDigest: `sha256:${'b'.repeat(64)}`,
            sourceRevision: `openapi:sha256:${'b'.repeat(64)}`,
            provenance: {
              sourceKind: 'openapi',
              sourceUrl: 'https://provider.example/openapi.yaml',
              authority: 'unverified_public',
            },
            authentication: [{ kind: 'public' }],
            candidates: [candidate],
          },
          candidateRef: candidate.candidateRef,
        }}
        onPreview={onPreview}
        onConnect={vi.fn()}
        onSelectCandidate={onSelectCandidate}
        onPublish={onPublish}
      />,
    )

    expect(screen.getByText('Source complete')).toBeTruthy()
    expect(screen.getByText('OpenAPI · https://provider.example/openapi.yaml · Production')).toBeTruthy()
    expect(screen.getByText('Tool complete')).toBeTruthy()
    expect((screen.getByLabelText('Tool name') as HTMLInputElement).value).toBe('Reference lookup')
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Looks up one public reference.')
    expect(onPreview).not.toHaveBeenCalled()
    expect(onSelectCandidate).not.toHaveBeenCalled()
  })

  it('discovers a native source and submits the selected Tool without protocol reconstruction fields', async () => {
    const onPreview = vi.fn().mockResolvedValue({
      kind: 'ready',
      sourceDigest: `sha256:${'b'.repeat(64)}`,
      sourceRevision: `openapi:sha256:${'b'.repeat(64)}`,
      provenance: {
        sourceKind: 'openapi',
        sourceUrl: 'https://provider.example/openapi.yaml',
        authority: 'unverified_public',
      },
      authentication: [{ kind: 'public' }],
      candidates: [candidate],
    })
    const onPublish = vi.fn().mockResolvedValue({
      kind: 'submitted',
      publicationRef: 'publication:lookup',
      publicationRevision: 1,
      toolRef: 'tool:lookup',
      state: 'Submitted',
    })
    const onSelectCandidate = vi.fn().mockResolvedValue({ kind: 'saved' })

    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        onPreview={onPreview}
        onConnect={vi.fn()}
        onSelectCandidate={onSelectCandidate}
        onPublish={onPublish}
      />,
    )

    expect(screen.queryByLabelText(/capability contract metadata/i)).toBeNull()
    expect(screen.queryByLabelText(/commercial metadata/i)).toBeNull()
    expect(screen.queryByLabelText(/tool definition/i)).toBeNull()
    expect(screen.queryByLabelText(/source revision/i)).toBeNull()

    expect(screen.getByRole('button', { name: /x402 recommended for alpha/i }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Other source types' }))
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'OpenAPI' }))

    fireEvent.change(screen.getByLabelText('OpenAPI URL'), {
      target: { value: 'https://provider.example/openapi.yaml' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find Tools' }))
    await screen.findByText('Reference lookup')
    expect(onPreview).toHaveBeenCalledWith(
      {
        kind: 'openapi',
        definitionUrl: 'https://provider.example/openapi.yaml',
        environment: 'sandbox',
      },
      expect.stringMatching(/^owner-supply-preview:/u),
    )

    fireEvent.click(screen.getByRole('radio', { name: /Reference lookup/i }))
    fireEvent.change(await screen.findByLabelText('Category'), { target: { value: 'Research' } })
    expect(onSelectCandidate).toHaveBeenCalledWith(expect.objectContaining({
      businessRef: 'business:one',
      candidate: expect.objectContaining({ candidateRef: candidate.candidateRef }),
    }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Send input data to the Provider' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Personal data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
    expect(screen.getByRole('group', { name: 'Tool publication decision' })).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'I am authorised to publish this service' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'The information is accurate' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Publish after validation succeeds' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit for validation' }))

    await waitFor(() => expect(onPublish).toHaveBeenCalledOnce())
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({
      businessRef: 'business:one',
      source: {
        kind: 'openapi',
        definitionUrl: 'https://provider.example/openapi.yaml',
        environment: 'sandbox',
      },
      candidateRef: candidate.candidateRef,
      expectedSourceDigest: `sha256:${'b'.repeat(64)}`,
      presentation: expect.objectContaining({
        name: 'Reference lookup',
        description: 'Looks up one public reference.',
        category: 'Research',
      }),
      pricing: { kind: 'free' },
      consequences: expect.objectContaining({
        dataUse: ['/query', '/path~1~0name'].map((inputPointer) => ({
          inputPointer,
          classification: 'personal',
          phase: 'execution',
          purposes: ['Perform the Tool'],
        })),
      }),
      attestation: {
        authorisedToPublish: true,
        informationAccurate: true,
        publishAfterSuccessfulValidation: true,
      },
    }))
    expect(await screen.findByText(/submitted for validation/i)).toBeTruthy()
    expect(screen.queryByText('tool:lookup')).toBeNull()
    expect(screen.getByRole('link', { name: 'Open Tools' }).getAttribute('href')).toBe('/owner/operations')
  })

  it('does not let an edit overtake a deferred Tool selection', async () => {
    const selection = deferred<{ kind: 'saved' }>()
    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        initial={{ ...selectedOpenApiInitial, candidateRef: '' }}
        onPreview={vi.fn()}
        onConnect={vi.fn()}
        onSelectCandidate={vi.fn(() => selection.promise)}
        onPublish={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: /Reference lookup/i }))
    const editSource = screen.getByRole('button', { name: 'Edit Source' }) as HTMLButtonElement
    expect(editSource.disabled).toBe(true)
    fireEvent.click(editSource)
    expect(screen.queryByRole('heading', { name: 'Source' })).toBeNull()

    selection.resolve({ kind: 'saved' })
    expect(await screen.findByRole('heading', { name: 'Terms' })).toBeTruthy()
    expect((screen.getByLabelText('Tool name') as HTMLInputElement).value).toBe('Reference lookup')
  })

  it('locks an uncertain publication command and keeps its attested facts immutable', async () => {
    const publication = deferred<never>()
    const onPublish = vi.fn(() => publication.promise)
    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        initial={selectedOpenApiInitial}
        onPreview={vi.fn()}
        onConnect={vi.fn()}
        onSelectCandidate={vi.fn()}
        onPublish={onPublish}
      />,
    )

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Research' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
    for (const name of [
      'I am authorised to publish this service',
      'The information is accurate',
      'Publish after validation succeeds',
    ]) fireEvent.click(screen.getByRole('checkbox', { name }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit for validation' }))

    expect((screen.getByRole('button', { name: 'Edit Source' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Edit Tool' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Edit Terms' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Edit terms' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('checkbox', { name: 'The information is accurate' }) as HTMLButtonElement).disabled).toBe(true)

    publication.reject(new Error('response lost'))
    expect(await screen.findByText(/could not confirm submission/i)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Submit for validation' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('link', { name: 'Open Tools' }).getAttribute('href')).toBe('/owner/operations')
    expect(onPublish).toHaveBeenCalledOnce()
  })

  it('requires fresh publication statements after terms are reopened', () => {
    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        initial={selectedOpenApiInitial}
        onPreview={vi.fn()}
        onConnect={vi.fn()}
        onSelectCandidate={vi.fn()}
        onPublish={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Research' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Fixed AUD price' }))
    fireEvent.change(screen.getByLabelText('AUD price'), { target: { value: '12.30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
    expect(screen.getAllByText('A$12.30').length).toBeGreaterThan(0)
    for (const name of [
      'I am authorised to publish this service',
      'The information is accurate',
      'Publish after validation succeeds',
    ]) fireEvent.click(screen.getByRole('checkbox', { name }))

    fireEvent.click(screen.getByRole('button', { name: 'Edit terms' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
    expect(screen.getByRole('checkbox', { name: 'I am authorised to publish this service' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('checkbox', { name: 'The information is accurate' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('checkbox', { name: 'Publish after validation succeeds' }).getAttribute('aria-checked')).toBe('false')
  })

  it('renders one direct hosted action when protected discovery requires connection', async () => {
    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        initial={{
          source: { kind: 'mcp', serverUrl: 'https://provider.example/mcp', environment: 'sandbox' },
          preview: {
            kind: 'ready',
            sourceDigest: `sha256:${'c'.repeat(64)}`,
            sourceRevision: `mcp:sha256:${'c'.repeat(64)}`,
            provenance: { sourceKind: 'mcp', sourceUrl: 'https://provider.example/mcp', authority: 'unverified_public' },
            authentication: [{ kind: 'public' }],
            candidates: [],
          },
          candidateRef: '',
        }}
        onPreview={vi.fn().mockResolvedValue({
          kind: 'action_required',
          requiredAction: {
            action: 'supply.source.preview',
            blockedCapabilities: ['supply.publish'],
            cta: '/owner/supply/connections/new?attempt=pca_one',
            ctaLabel: 'Connect server',
            description: 'Sign in to the MCP server, then AE will continue finding Tools.',
            iconUrl: null,
            status: 'required',
            title: 'Connect MCP server',
          },
        })}
        onConnect={vi.fn()}
        onSelectCandidate={vi.fn()}
        onPublish={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit Source' }))
    fireEvent.click(screen.getByRole('button', { name: 'Find Tools' }))

    const action = await screen.findByRole('link', { name: 'Connect server' })
    expect(action.getAttribute('href')).toBe('/owner/supply/connections/new?attempt=pca_one')
    expect(screen.queryByText(/could not inspect/i)).toBeNull()
  })

  it('requires one exact Registry remote before finding Tools', async () => {
    const remoteRef = `sha256:${'d'.repeat(64)}`
    const onPreview = vi.fn()
      .mockResolvedValueOnce({
        kind: 'remote_selection_required',
        sourceKind: 'mcp',
        sourceDigest: `sha256:${'e'.repeat(64)}`,
        sourceRevision: `mcp-registry:sha256:${'e'.repeat(64)}`,
        registryName: 'io.example/reference-tools',
        remotes: [{
          remoteRef,
          name: 'west.tools.example/mcp',
          serverUrl: 'https://west.tools.example/mcp',
        }],
      })
      .mockResolvedValueOnce({
        kind: 'ready',
        sourceDigest: `sha256:${'f'.repeat(64)}`,
        sourceRevision: `mcp:sha256:${'f'.repeat(64)}`,
        provenance: {
          sourceKind: 'mcp',
          sourceUrl: 'https://west.tools.example/mcp',
          authority: 'verified_registry',
        },
        authentication: [{ kind: 'public' }],
        candidates: [candidate],
      })

    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        initial={{
          source: { kind: 'mcp', registryName: 'io.example/reference-tools', environment: 'sandbox' },
          preview: {
            kind: 'ready',
            sourceDigest: `sha256:${'c'.repeat(64)}`,
            sourceRevision: `mcp:sha256:${'c'.repeat(64)}`,
            provenance: { sourceKind: 'mcp', sourceUrl: 'https://placeholder.example/mcp', authority: 'verified_registry' },
            authentication: [{ kind: 'public' }],
            candidates: [],
          },
          candidateRef: '',
        }}
        onPreview={onPreview}
        onConnect={vi.fn()}
        onSelectCandidate={vi.fn()}
        onPublish={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit Source' }))
    fireEvent.click(screen.getByRole('button', { name: 'Find Tools' }))

    expect(await screen.findByText('Select MCP server')).toBeTruthy()
    expect(onPreview).toHaveBeenNthCalledWith(1, {
      kind: 'mcp',
      registryName: 'io.example/reference-tools',
      environment: 'sandbox',
    }, expect.any(String))
    expect(screen.queryByText('Reference lookup')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: /west\.tools\.example/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue with selected server' }))

    expect(await screen.findByText('Reference lookup')).toBeTruthy()
    expect(onPreview).toHaveBeenNthCalledWith(2, {
      kind: 'mcp',
      registryName: 'io.example/reference-tools',
      remoteRef,
      environment: 'sandbox',
    }, expect.any(String))
  })

  it('labels required source fields and exposes the Find Tools action', () => {
    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        onPreview={vi.fn()}
        onConnect={vi.fn()}
        onSelectCandidate={vi.fn()}
        onPublish={vi.fn()}
      />,
    )

    const resourceUrl = screen.getByLabelText('x402 resource URL') as HTMLInputElement
    expect(resourceUrl.required).toBe(true)
    expect(resourceUrl.placeholder).toBe('https://api.example.com/paid-operation')
    expect(screen.getAllByText('Required')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Find Tools' })).toBeTruthy()
  })

  it('shows live OpenAPI URL preflight without clicking Discover', () => {
    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        onPreview={vi.fn()}
        onConnect={vi.fn()}
        onSelectCandidate={vi.fn()}
        onPublish={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Other source types' }))
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'OpenAPI' }))

    fireEvent.change(screen.getByLabelText('OpenAPI URL'), {
      target: { value: 'http://insecure.example.com/openapi.json' },
    })
    expect(screen.getByText('Insecure HTTP URL detected. Agentic Economy requires secure HTTPS endpoints.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('OpenAPI URL'), { target: { value: 'notaurl' } })
    expect(screen.getByText('Enter a valid HTTPS URL, for example https://api.example.com/openapi.json.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('OpenAPI URL'), {
      target: { value: 'https://api.example.com/openapi.json' },
    })
    expect(screen.getByText('Valid HTTPS endpoint format')).toBeTruthy()
  })

  it('shows live MCP and x402 URL preflight badges', () => {
    const onPreview = vi.fn()
    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        onPreview={onPreview}
        onConnect={vi.fn()}
        onSelectCandidate={vi.fn()}
        onPublish={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Other source types' }))
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'MCP' }))
    fireEvent.change(screen.getByLabelText('MCP server URL'), {
      target: { value: 'https://mcp.example.com/sse' },
    })
    expect(screen.getByText('Valid HTTPS endpoint format')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /x402 recommended for alpha/i }))

    fireEvent.change(screen.getByLabelText('x402 resource URL'), {
      target: { value: 'http://insecure.example.com/paid' },
    })
    expect(screen.getByText('Insecure HTTP URL detected. Agentic Economy requires secure HTTPS endpoints.')).toBeTruthy()
    expect(onPreview).not.toHaveBeenCalled()
  })

  it('blocks Discover on insecure URLs with Rule 4 diagnostic and skips preview', async () => {
    const onPreview = vi.fn()
    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        onPreview={onPreview}
        onConnect={vi.fn()}
        onSelectCandidate={vi.fn()}
        onPublish={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Other source types' }))
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'OpenAPI' }))
    fireEvent.change(screen.getByLabelText('OpenAPI URL'), {
      target: { value: 'http://insecure.example.com/openapi.json' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find Tools' }))

    expect(await screen.findByText('The URL uses insecure HTTP.')).toBeTruthy()
    expect(screen.getByText('A$0.00 affected. Tool discovery was blocked.')).toBeTruthy()
    expect(screen.getByText('Replace http:// with https:// and try again.')).toBeTruthy()
    expect(onPreview).not.toHaveBeenCalled()
  })

  it('labels parsed plugin JSON as top-level keys only, including empty remote declarations', async () => {
    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        onPreview={vi.fn()}
        onConnect={vi.fn()}
        onSelectCandidate={vi.fn()}
        onPublish={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Other source types' }))
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Agent Plugin' }))
    fireEvent.change(screen.getByLabelText('plugin.json'), {
      target: { files: [new File(['{"$schema":"spec","name":"sample"}'], 'plugin.json', { type: 'application/json' })] },
    })
    fireEvent.change(screen.getByLabelText('mcp.json'), {
      target: { files: [new File(['{"$schema":"spec","mcpServers":{}}'], 'mcp.json', { type: 'application/json' })] },
    })
    expect(await screen.findByText('JSON object parsed; $schema and name present')).toBeTruthy()
    expect(await screen.findByText('JSON object parsed; $schema and mcpServers present')).toBeTruthy()
    expect(screen.queryByText('Valid JSON payload')).toBeNull()
  })

  it('blocks Discover on malformed plugin JSON with Rule 4 diagnostic', async () => {
    const onPreview = vi.fn()
    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        onPreview={onPreview}
        onConnect={vi.fn()}
        onSelectCandidate={vi.fn()}
        onPublish={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Other source types' }))
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Agent Plugin' }))

    const malformed = new File(['{not-json'], 'plugin.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('plugin.json'), { target: { files: [malformed] } })
    await waitFor(() => {
      expect(screen.getByText('JSON syntax is invalid.')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find Tools' }))

    expect(await screen.findByText('JSON file syntax is invalid.')).toBeTruthy()
    expect(screen.getByText('A$0.00 affected. Tool discovery was blocked.')).toBeTruthy()
    expect(screen.getByText('Fix the JSON syntax, then choose the file again.')).toBeTruthy()
    expect(onPreview).not.toHaveBeenCalled()
  })

  it('reserves preflight height and applies tactile physics to source controls', () => {
    render(
      <AeSupplySourceNativeStart
        businessRef="business:one"
        onPreview={vi.fn()}
        onConnect={vi.fn()}
        onSelectCandidate={vi.fn()}
        onPublish={vi.fn()}
      />,
    )

    const tactile = 'enabled:active:scale-[0.98]'
    expect(screen.getByRole('button', { name: /x402 recommended for alpha/i }).className).toContain(tactile)
    expect(screen.getByRole('button', { name: 'Other source types' }).className).toContain(tactile)
    expect(screen.getByRole('button', { name: 'Find Tools' }).className).toContain(tactile)
    expect(screen.getByRole('radio', { name: 'Sandbox' }).closest('label')?.className).toContain(tactile)

    fireEvent.click(screen.getByRole('button', { name: 'Other source types' }))
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'OpenAPI' }))
    fireEvent.change(screen.getByLabelText('OpenAPI URL'), { target: { value: 'notaurl' } })

    const slot = document.querySelector('.min-h-\\[2\\.5rem\\][aria-live="polite"]')
    expect(slot).toBeTruthy()
  })
})


describe('Provider source suggestion review', () => {
  const suggestion = { kind: 'suggested', sourceDigest: selectedOpenApiInitial.preview.sourceDigest,
    sourceRevision: selectedOpenApiInitial.preview.sourceRevision, candidateRef: candidate.candidateRef,
    description: 'A source-backed description.', evidence: [] }
  const current = { kind: 'current', sourceDigest: suggestion.sourceDigest, sourceRevision: suggestion.sourceRevision, candidateRef: candidate.candidateRef }
  function setup(onAssess = vi.fn().mockResolvedValueOnce(suggestion).mockResolvedValueOnce(current)) {
    const onPublish = vi.fn()
    const view = render(<AeSupplySourceNativeStart businessRef="business:one" initial={selectedOpenApiInitial}
      onPreview={vi.fn()} onConnect={vi.fn()} onSelectCandidate={vi.fn()} onPublish={onPublish} onAssess={onAssess} />)
    return { ...view, onAssess, onPublish }
  }

  it('requires explicit acceptance and a fresh source check before changing text', async () => {
    const { onAssess, onPublish } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest from source' }))
    await screen.findByRole('button', { name: 'Use description' })
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe(candidate.description)
    expect(onPublish).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Use description' }))
    await waitFor(() => expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe(suggestion.description))
    expect(onAssess.mock.calls.map(call => call[0].mode)).toEqual(['suggest', 'verify'])
    expect(onPublish).not.toHaveBeenCalled()
    onPublish.mockResolvedValue({ kind: 'refused', reason: 'source_unavailable' })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Research' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'I am authorised to publish this service' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'The information is accurate' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Publish after validation succeeds' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit for validation' }))
    await waitFor(() => expect(onPublish).toHaveBeenCalledOnce())
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({
      expectedSourceDigest: suggestion.sourceDigest,
      candidateRef: suggestion.candidateRef,
      presentation: expect.objectContaining({ description: suggestion.description }),
    }))
  })

  it('keeps the existing description when dismissed', async () => {
    const { onAssess } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest from source' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Keep current description' }))
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe(candidate.description)
    expect(onAssess).toHaveBeenCalledTimes(1)
  })

  it('does not apply a suggestion after source verification fails', async () => {
    setup(vi.fn().mockResolvedValueOnce(suggestion).mockResolvedValueOnce({ kind: 'unavailable', reason: 'source_changed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suggest from source' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use description' }))
    await screen.findByText(/No current suggestion is available/)
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe(candidate.description)
  })

  it('cancels an in-flight verification when the Provider edits the description', async () => {
    const verification = deferred<typeof current>()
    const { onAssess } = setup(vi.fn().mockResolvedValueOnce(suggestion).mockReturnValueOnce(verification.promise))
    fireEvent.click(screen.getByRole('button', { name: 'Suggest from source' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use description' }))
    const signal = onAssess.mock.calls[1]?.[1] as AbortSignal
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'My newer description.' } })
    expect(signal.aborted).toBe(true)
    verification.resolve(current)
    await waitFor(() => expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('My newer description.'))
  })

  it('aborts inference when leaving the source editor', async () => {
    const pending = deferred<typeof suggestion>()
    const { onAssess, unmount } = setup(vi.fn().mockReturnValue(pending.promise))
    fireEvent.click(screen.getByRole('button', { name: 'Suggest from source' }))
    const signal = onAssess.mock.calls[0]?.[1] as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
    pending.resolve(suggestion)
  })
})
