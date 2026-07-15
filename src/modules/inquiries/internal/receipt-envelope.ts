import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

import { stableStringify } from '@/modules/common/stable-hash'
import type { GovernedSendReceiptRecord } from './governed-send'

export const InquiryReceiptEnvelopeVersion = 'inquiry-receipt-envelope:v1' as const

export type InquiryReceiptKeyring = Readonly<{
  keyId: string
  secret: string
}>

export type InquiryEncryptedReceiptPayload = Readonly<{
  envelopeVersion: typeof InquiryReceiptEnvelopeVersion
  keyRef: string
  ciphertextBase64: string
  contentIvBase64: string
}>

export type InquiryWrappedReceiptKey = Readonly<{
  keyRef: string
  receiptOperationKey: string
  wrappedKeyBase64: string
  wrapIvBase64: string
  kekKeyId: string
  createdAt: number
}>

export type InquiryEncryptedReceipt = Readonly<{
  payload: InquiryEncryptedReceiptPayload
  wrappedKey: InquiryWrappedReceiptKey
}>

export async function encryptGovernedSendReceipt(
  receipt: Extract<GovernedSendReceiptRecord, { retention: 'recoverable' }>,
  keyring: InquiryReceiptKeyring,
): Promise<InquiryEncryptedReceipt> {
  assertReceiptKeyring(keyring)
  const keyRef = inquiryReceiptKeyRef(receipt)
  const additionalData = ownedBytes(new TextEncoder().encode(receiptAdditionalData(receipt, keyRef)))
  const dataKeyBytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)))
  const contentIv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)))
  const wrapIv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)))
  const dataKey = await crypto.subtle.importKey('raw', dataKeyBytes, { name: 'AES-GCM' }, false, ['encrypt'])
  const wrappingKey = await importWrappingKey(keyring.secret)
  const canonicalBytes = base64ToBytes(receipt.canonicalBytesBase64)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: contentIv, additionalData },
    dataKey,
    canonicalBytes,
  )
  const wrappedKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: wrapIv, additionalData },
    wrappingKey,
    dataKeyBytes,
  )
  dataKeyBytes.fill(0)

  return {
    payload: {
      envelopeVersion: InquiryReceiptEnvelopeVersion,
      keyRef,
      ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)),
      contentIvBase64: bytesToBase64(contentIv),
    },
    wrappedKey: {
      keyRef,
      receiptOperationKey: String(receipt.operationKey),
      wrappedKeyBase64: bytesToBase64(new Uint8Array(wrappedKey)),
      wrapIvBase64: bytesToBase64(wrapIv),
      kekKeyId: keyring.keyId,
      createdAt: receipt.createdAt,
    },
  }
}

export async function decryptGovernedSendReceipt(input: Readonly<{
  receipt: Omit<Extract<GovernedSendReceiptRecord, { retention: 'recoverable' }>, 'canonicalBytesBase64' | 'retention'>
  payload: InquiryEncryptedReceiptPayload
  wrappedKey: InquiryWrappedReceiptKey
  keyring: InquiryReceiptKeyring
}>): Promise<string> {
  assertReceiptKeyring(input.keyring)
  if (
    input.payload.envelopeVersion !== InquiryReceiptEnvelopeVersion ||
    input.payload.keyRef !== input.wrappedKey.keyRef ||
    input.wrappedKey.receiptOperationKey !== String(input.receipt.operationKey) ||
    input.wrappedKey.kekKeyId !== input.keyring.keyId
  ) {
    throw new Error('Governed-send receipt encryption metadata does not match.')
  }

  const additionalData = ownedBytes(new TextEncoder().encode(receiptAdditionalData(input.receipt, input.payload.keyRef)))
  const wrappingKey = await importWrappingKey(input.keyring.secret)
  const dataKeyBytes = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(input.wrappedKey.wrapIvBase64),
      additionalData,
    },
    wrappingKey,
    base64ToBytes(input.wrappedKey.wrappedKeyBase64),
  )
  const dataKeyBytesView = new Uint8Array(dataKeyBytes)

  try {
    const dataKey = await crypto.subtle.importKey('raw', dataKeyBytesView, { name: 'AES-GCM' }, false, ['decrypt'])
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(input.payload.contentIvBase64),
        additionalData,
      },
      dataKey,
      base64ToBytes(input.payload.ciphertextBase64),
    )
    return bytesToBase64(new Uint8Array(plaintext))
  } finally {
    dataKeyBytesView.fill(0)
  }
}

export function resolveInquiryReceiptKeyring(
  environment: Readonly<Record<string, string | undefined>>,
): InquiryReceiptKeyring {
  const secret = environment.AE_INQUIRY_RECEIPT_KEK?.trim()
  if (secret === undefined || secret.length < 32) {
    throw new Error('AE_INQUIRY_RECEIPT_KEK must contain at least 32 characters.')
  }

  const keyId = environment.AE_INQUIRY_RECEIPT_KEK_ID?.trim() || 'inquiry-receipt-kek-v1'
  return { keyId, secret }
}

function receiptAdditionalData(
  receipt: Pick<GovernedSendReceiptRecord, 'operationKey' | 'threadId' | 'digest' | 'schemaVersion' | 'recipientRef'>,
  keyRef: string,
): string {
  return stableStringify({
    envelopeVersion: InquiryReceiptEnvelopeVersion,
    keyRef,
    operationKey: String(receipt.operationKey),
    threadId: String(receipt.threadId),
    digest: receipt.digest,
    schemaVersion: receipt.schemaVersion,
    recipientRef: receipt.recipientRef,
  })
}

export function inquiryReceiptKeyRef(
  receipt: Pick<GovernedSendReceiptRecord, 'operationKey' | 'threadId' | 'digest'>,
): string {
  const material = stableStringify({
    envelopeVersion: InquiryReceiptEnvelopeVersion,
    operationKey: String(receipt.operationKey),
    threadId: String(receipt.threadId),
    digest: receipt.digest,
  })
  return `inquiry-receipt-key:sha256:${bytesToHex(sha256(material))}`
}

async function importWrappingKey(secret: string) {
  return crypto.subtle.importKey('raw', ownedBytes(sha256(secret)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const owned = new Uint8Array(new ArrayBuffer(bytes.length))
  owned.set(bytes)
  return owned
}

function assertReceiptKeyring(keyring: InquiryReceiptKeyring): void {
  if (keyring.secret.trim().length < 32 || keyring.keyId.trim().length === 0) {
    throw new Error('Inquiry receipt encryption keyring is not configured.')
  }
}
