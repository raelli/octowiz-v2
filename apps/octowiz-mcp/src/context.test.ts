import { describe, expect, it } from 'vitest'
import { failOpen, okText } from './context.js'

describe('failOpen', () => {
  it('returns the wrapped result on success', async () => {
    const wrapped = failOpen(async () => okText('done'))
    const r = await wrapped({})
    expect(r.isError).toBeFalsy()
    expect(r.content[0]!.text).toBe('done')
  })

  it('converts a thrown error into an isError text result, never throws', async () => {
    const wrapped = failOpen(async () => {
      throw new Error('boom')
    })
    const r = await wrapped({})
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain('boom')
  })
})
