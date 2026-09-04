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
  inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
  authentication: { kind: 'public' as const },
  validationExampleAvailable: true,
  disposition: { kind: 'supported' as const },
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
        description: 'Enter the service credential securely, then AE will return to this Operation.',
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

    expect((screen.getByLabelText('OpenAPI URL') as HTMLInputElement).value).toBe('https://provider.example/openapi.yaml')
    expect(screen.getByLabelText('Production').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /Reference lookup/i }).getAttribute('aria-checked')).toBe('true')
    expect((screen.getByLabelText('Operation name') as HTMLInputElement).value).toBe('Reference lookup')
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Looks up one public reference.')
    expect(onPreview).not.toHaveBeenCalled()
    expect(onSelectCandidate).not.toHaveBeenCalled()
  })

  it('discovers a native source and submits the selected Operation without protocol reconstruction fields', async () => {
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
      operationRef: 'operation:lookup',
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

    fireEvent.change(screen.getByLabelText('OpenAPI URL'), {
      target: { value: 'https://provider.example/openapi.yaml' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find Operations' }))
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
      attestation: {
        authorisedToPublish: true,
        informationAccurate: true,
        publishAfterSuccessfulValidation: true,
      },
    }))
    expect(await screen.findByText(/submitted for validation/i)).toBeTruthy()
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
            description: 'Sign in to the MCP server, then AE will continue finding Operations.',
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

    fireEvent.click(screen.getByRole('button', { name: 'Find Operations' }))

    const action = await screen.findByRole('link', { name: 'Connect server' })
    expect(action.getAttribute('href')).toBe('/owner/supply/connections/new?attempt=pca_one')
    expect(screen.queryByText(/could not inspect/i)).toBeNull()
  })

  it('requires one exact Registry remote before finding Operations', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Find Operations' }))

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
})
