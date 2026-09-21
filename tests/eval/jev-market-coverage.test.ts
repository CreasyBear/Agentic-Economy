import { describe, expect, it } from 'vitest'
import { lexicalOrder, uniqueRoundRobin, validatedScores } from '../../tools/dev/eval-jev-market-coverage'

describe('market coverage experiment controls', () => {
  it('retains the complete unique retrieval union with stable interleaving', () => {
    expect(uniqueRoundRobin([['a', 'b'], ['b', 'c'], ['d']])).toEqual(['a', 'b', 'd', 'c'])
    expect(uniqueRoundRobin([])).toEqual([])
  })
  it('lexical control uses supplied words, not invented semantic equivalence', () => {
    const cards = [
      { resource: 'a', provider: 'a', title: 'Voice', description: 'Read text aloud' },
      { resource: 'b', provider: 'b', title: 'Speech', description: 'Convert text to speech' },
    ]
    expect(lexicalOrder(cards, 'text speech')).toEqual(['b', 'a'])
    expect(lexicalOrder(cards, 'unrelated')).toEqual(['a', 'b'])
  })
  it('rejects partial, malformed and out-of-range responses rather than dropping candidates', () => {
    expect(validatedScores({ c0: { type: 'noul', noul: 0.9 }, c1: { type: 'noul', noul: 0 } }, 2)).toEqual([0.9, 0])
    for (const invalid of [undefined, {}, { c0: { type: 'noul', noul: 2 } }, { c0: { type: 'choice', noul: 0.9 } }, { c0: { type: 'noul', noul: Number.NaN } }]) {
      expect(validatedScores(invalid, 1)).toBeUndefined()
    }
    expect(validatedScores({ c0: { type: 'noul', noul: 0.9 } }, 2)).toBeUndefined()
  })
})
