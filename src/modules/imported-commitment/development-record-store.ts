import type {
  ImportedCommitmentRowPort,
  ImportedCommitmentSourceRecord,
} from './contracts'

export function createDevelopmentImportedCommitmentStore(
  initialRows: readonly ImportedCommitmentSourceRecord[] = [],
): ImportedCommitmentRowPort & Readonly<{ snapshot(): readonly ImportedCommitmentSourceRecord[] }> {
  const rows = new Map(initialRows.map((row) => [row.claim.claimRef, clone(row)]))
  return {
    load: (claimRef) => {
      const row = rows.get(claimRef)
      return row === undefined ? null : clone(row)
    },
    insert: (record) => {
      if (rows.has(record.claim.claimRef)) throw new Error('imported_commitment_duplicate_insert')
      rows.set(record.claim.claimRef, clone(record))
    },
    snapshot: () => Object.freeze([...rows.values()].map(clone)),
  }
}

function clone(record: ImportedCommitmentSourceRecord): ImportedCommitmentSourceRecord {
  return structuredClone(record)
}
