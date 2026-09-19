export function formatConsentDuration(seconds: number): string {
  if (seconds % 86_400 === 0) return `in ${seconds / 86_400} ${seconds === 86_400 ? 'day' : 'days'}`
  if (seconds % 3_600 === 0) return `in ${seconds / 3_600} ${seconds === 3_600 ? 'hour' : 'hours'}`
  if (seconds % 60 === 0) return `in ${seconds / 60} ${seconds === 60 ? 'minute' : 'minutes'}`
  return `in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
}
