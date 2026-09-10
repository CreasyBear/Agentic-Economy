export async function isJsonContentType(contentType: string | null): Promise<boolean> {
  if (contentType === null) return false
  try {
    const { MIMEType } = await import('node:util')
    return new MIMEType(contentType).essence === 'application/json'
  } catch {
    return false
  }
}
