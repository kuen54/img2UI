import { describe, it, expect } from 'vitest'

import { parseAccessKey } from '../cdn-client'

describe('parseAccessKey', () => {
  it('split id:secret on first colon', () => {
    expect(parseAccessKey('AKIA123:secret/with:colons')).toEqual({
      id: 'AKIA123',
      secret: 'secret/with:colons',
    })
  })

  it('throws on missing colon', () => {
    expect(() => parseAccessKey('no-colon')).toThrow(/格式错/)
  })

  it('handles empty secret', () => {
    expect(parseAccessKey('id:')).toEqual({ id: 'id', secret: '' })
  })
})
