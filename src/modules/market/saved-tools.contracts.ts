import type { X402DirectoryEntry, X402DirectoryInput } from './x402-directory'

export const DIRECTORY_SAVED_TOOLS_STORAGE_KEY = 'ae:directory:saved-tools:v1'
export const DIRECTORY_SAVED_TOOLS_LIMIT = 100

export type SavedDirectoryTool = Readonly<{
  entry: X402DirectoryEntry
  search: X402DirectoryInput
}>

export type StorageState = 'checking' | 'browser' | 'session'
