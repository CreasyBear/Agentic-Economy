/** Pure, dependency-free secret redaction shared by telemetry and backend logging (OWASP Logging Cheat Sheet, CWE-532). */
export const filteredTelemetryValue = '[Filtered]'

const privateKeyPemPattern = /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/giu
const authorizationPattern = /(\bAuthorization\b\s*["']?\s*[:=]\s*)(["']?)(Bearer|Basic)\s+([^"'`,;\s]+)\2/giu
const cookieHeaderPattern = /(\b(?:Cookie|Set-Cookie)\b\s*["']?\s*[:=]\s*)[^\r\n]*/giu
const urlUserInfoPattern = /(\bhttps?:\/\/)[^/\s?#@]+(?::[^/\s?#@]*)?@/giu
const secretAssignmentPattern = /(\b(?:[A-Za-z0-9]+[_-])*(?:key|token|secret|password|api[_-]?key|access[_-]?(?:key|token)|client[_-]?secret|user[_-]?code|device[_-]?code|authorization[_-]?code|grant[_-]?ref|oauth[_-]?state|state)\b\s*["']?\s*[:=]\s*)(["']?)([^"'`\s,;&}\]]+)\2/giu
const relativeUrlQueryPattern = /(^|\s)(\/[^\s?#]*)[?#][^\s"'`]*/giu

export function redactShareTokenPath(value: string): string {
  return value.replace(/\/s\/[0-9a-f]{64}(?=\/|[?#\s]|$)/gi, '/s/[Filtered]')
}

export function redactSensitiveText(value: string): string {
  const redacted = value
    .replace(privateKeyPemPattern, (_match: string, label: string) =>
      `-----BEGIN ${label}-----${filteredTelemetryValue}-----END ${label}-----`)
    .replace(
      authorizationPattern,
      (_match: string, prefix: string, quote: string, scheme: string) =>
        `${prefix}${quote}${scheme} ${filteredTelemetryValue}${quote}`,
    )
    .replace(cookieHeaderPattern, (_match: string, prefix: string) => `${prefix}${filteredTelemetryValue}`)
    .replace(relativeUrlQueryPattern, (_match: string, prefix: string, pathname: string) => `${prefix}${pathname}`)
    .replace(urlUserInfoPattern, '$1[Filtered]@')
    .replace(
      secretAssignmentPattern,
      (_match: string, prefix: string, quote: string) => `${prefix}${quote}${filteredTelemetryValue}${quote}`,
    )
    .replace(
      /([?&#]|\b)(k|access|accessKey|accessToken|token|secret|password|email|phone)=([^&#\s]*)/gi,
      (_match: string, prefix: string, name: string) => `${prefix}${name}=${filteredTelemetryValue}`,
    )
  return redactShareTokenPath(redacted)
}
