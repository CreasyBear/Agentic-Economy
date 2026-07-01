import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import type { SourceHash } from '@/modules/common/ids'
import type { RegistrySearchDocument } from '@/modules/registry/internal/search-documents'
import {
  applyRegistrySearchTaskReadback,
  markRegistrySearchSyncStale,
  queueRegistrySearchSyncAttempt,
  retryRegistrySearchSyncAttempt,
} from '@/modules/registry/internal/search-sync'

describe('registry search sync attempts', () => {
  it('queues an upsert attempt with task and hash tracking', () => {
    const attempt = queueRegistrySearchSyncAttempt({
      attemptId: 'attempt-1',
      operation: 'upsert',
      document: searchDocument(),
      meiliTaskUid: '42',
      now: 1_000,
    })

    expect(attempt).toMatchObject({
      attemptId: 'attempt-1',
      documentId: 'parramatta-emergency-plumbing:emergency-pipe-repair',
      operation: 'upsert',
      status: 'queued',
      meiliTaskUid: '42',
      sourceHash: 'hash:source:one',
      generatedHash: 'hash:generated:one',
      retryCount: 0,
    })
  })

  it('marks succeeded only after task readback succeeds', () => {
    const attempt = queueRegistrySearchSyncAttempt({
      attemptId: 'attempt-1',
      operation: 'upsert',
      document: searchDocument(),
      meiliTaskUid: '42',
      now: 1_000,
    })

    expect(
      applyRegistrySearchTaskReadback(
        attempt,
        {
          taskUid: '42',
          indexUid: 'registry',
          status: 'succeeded',
        },
        2_000,
      ),
    ).toMatchObject({
      status: 'succeeded',
      finishedAt: 2_000,
      meiliTaskUid: '42',
    })
  })

  it('records failed task readback and retry state', () => {
    const attempt = queueRegistrySearchSyncAttempt({
      attemptId: 'attempt-1',
      operation: 'upsert',
      document: searchDocument(),
      now: 1_000,
    })
    const failed = applyRegistrySearchTaskReadback(
      attempt,
      {
        taskUid: '42',
        indexUid: 'registry',
        status: 'failed',
        errorCode: 'invalid_document',
        errorMessage: 'Document rejected.',
      },
      2_000,
    )
    const retry = retryRegistrySearchSyncAttempt(failed, {
      retryAfter: 3_000,
      now: 2_500,
    })

    expect(failed).toMatchObject({
      status: 'failed',
      lastErrorCode: 'invalid_document',
      lastErrorRedacted: 'Document rejected.',
    })
    expect(retry).toMatchObject({
      status: 'queued',
      retryCount: 1,
      retryAfter: 3_000,
      startedAt: 2_500,
    })
  })

  it('marks attempts stale when source or generated hash changes', () => {
    const attempt = queueRegistrySearchSyncAttempt({
      attemptId: 'attempt-1',
      operation: 'upsert',
      document: searchDocument(),
      now: 1_000,
    })

    expect(
      markRegistrySearchSyncStale(attempt, {
        currentSourceHash: brandNonEmpty('hash:source:two', 'SourceHash'),
        currentGeneratedHash: brandNonEmpty('hash:generated:one', 'SourceHash'),
        now: 2_000,
      }),
    ).toMatchObject({
      status: 'stale',
      staleReason: 'source_hash_changed',
      finishedAt: 2_000,
    })
  })

  it('tracks delete and suppression operations', () => {
    expect(
      queueRegistrySearchSyncAttempt({
        attemptId: 'delete-1',
        operation: 'delete',
        documentId: 'parramatta-emergency-plumbing:emergency-pipe-repair',
        businessSlug: 'parramatta-emergency-plumbing',
        serviceSlug: 'emergency-pipe-repair',
        now: 1_000,
      }),
    ).toMatchObject({ operation: 'delete', status: 'queued' })

    expect(
      queueRegistrySearchSyncAttempt({
        attemptId: 'suppress-1',
        operation: 'suppress',
        documentId: 'parramatta-emergency-plumbing:emergency-pipe-repair',
        businessSlug: 'parramatta-emergency-plumbing',
        serviceSlug: 'emergency-pipe-repair',
        now: 1_000,
      }),
    ).toMatchObject({ operation: 'suppress', status: 'queued' })
  })
})

function searchDocument(): RegistrySearchDocument & { sourceHash: SourceHash } {
  return {
    documentId: 'parramatta-emergency-plumbing:emergency-pipe-repair',
    schemaVersion: 'registry-search-document:v1',
    businessSlug: 'parramatta-emergency-plumbing',
    serviceSlug: 'emergency-pipe-repair',
    businessName: 'Parramatta Emergency Plumbing',
    serviceName: 'Emergency pipe repair',
    serviceCategory: 'Emergency plumbing',
    serviceCategoryKey: 'emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicStatus: 'published',
    trustTier: 'claimed',
    firstRequestMode: 'inquiry_available',
    placeKeys: ['parramatta', 'parramatta nsw', 'nsw'],
    serviceKeywords: ['plumber', 'plumbers', 'urgent'],
    searchText: 'parramatta emergency plumbing emergency pipe repair plumber',
    serviceArea: 'Parramatta and nearby suburbs',
    sourceHash: brandNonEmpty('hash:source:one', 'SourceHash'),
    generatedHash: brandNonEmpty('hash:generated:one', 'SourceHash'),
    updatedAt: 1_000,
  }
}
