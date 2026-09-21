// Prints a one-time sign-in URL for the local E2E owner user (Clerk ticket strategy).
// Usage: npm run -s dev:sign-in-url [-- http://127.0.0.1:3024]  (loads the same dotenv files as dev:local)
const secret = process.env.CLERK_SECRET_KEY
const email = process.env.AE_E2E_OWNER_EMAIL
if (secret === undefined || email === undefined) {
  console.error('CLERK_SECRET_KEY and AE_E2E_OWNER_EMAIL must be set in one of .env, .env.local, .env.development, .env.development.local')
  process.exit(1)
}
const base = process.argv[2] ?? 'http://127.0.0.1:3024'
const headers = { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }
async function clerk<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.clerk.com/v1${path}`, { ...init, headers })
  if (!response.ok) throw new Error(`Clerk ${path} → HTTP ${response.status}`)
  return response.json() as Promise<T>
}
const users = await clerk<{ id: string }[]>(`/users?email_address=${encodeURIComponent(email)}&limit=1`)
const userId = users[0]?.id
if (userId === undefined) throw new Error('No Clerk user matches AE_E2E_OWNER_EMAIL')
const { token } = await clerk<{ token: string }>('/sign_in_tokens', { method: 'POST', body: JSON.stringify({ user_id: userId, expires_in_seconds: 600 }) })
console.log(`${base}/sign-in?__clerk_ticket=${encodeURIComponent(token)}`)
