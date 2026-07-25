/**
 * Labelled local stub of the OpenRouter chat-completions endpoint, used to
 * demonstrate the business-enrichment route end to end without spending real
 * model budget. It is not a provider and proves nothing about live model
 * behavior. Point the app at it with:
 *   AE_OPENROUTER_API_BASE_URL=http://127.0.0.1:4555/api/v1
 */
import { createServer } from 'node:http'

const port = Number(process.env.STUB_PORT ?? 4555)

const draftedFacts = {
  businessName: 'Adelaide Emergency Plumbing',
  category: 'Emergency plumbing',
  suburb: 'Adelaide',
  stateTerritory: 'SA',
  websiteUrl: 'https://adelaide-emergency-plumbing.example',
  serviceName: 'Burst pipe repair',
  serviceCategory: 'Emergency plumbing',
  serviceSummary: 'Burst pipe and blocked drain repairs for Adelaide homes.',
  serviceArea: 'Adelaide and nearby suburbs',
}

createServer((request, response) => {
  if (!request.url?.endsWith('/chat/completions')) {
    response.writeHead(404).end('{}')
    return
  }

  let body = ''
  request.on('data', (chunk) => {
    body += chunk
  })
  request.on('end', () => {
    process.stdout.write(`stub received ${body.length} bytes\n`)
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(draftedFacts),
              annotations: [
                { type: 'url_citation', url_citation: { url: 'https://adelaide-emergency-plumbing.example/about' } },
                { type: 'url_citation', url_citation: { url: 'https://directory.example/adelaide-emergency-plumbing' } },
              ],
            },
          },
        ],
      }),
    )
  })
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`stub openrouter listening on http://127.0.0.1:${port}\n`)
})
