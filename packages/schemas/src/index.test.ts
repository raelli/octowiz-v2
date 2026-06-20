import { describe, expect, it } from 'vitest'
import { SCHEMAS_VERSION } from './index'

describe('schemas', () => {
  it('exposes a version constant', () => {
    expect(SCHEMAS_VERSION).toBe('0.0.0')
  })
})
