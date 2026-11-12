import { describe, expect, it } from 'vitest'
import { withDetectedImageTypes } from './vitePlugin.js'
import { PNG_1x1 } from './seed.js'

describe('dev server uploads', () => {
  it('types each file by its first bytes, as the backend does, and keeps text parts', async () => {
    const form = new FormData()
    form.append('comment', 'Fixed.')
    form.append('files', new File([PNG_1x1], 'fix.jpg', { type: 'image/jpeg' }))
    form.append('files', new File(['not an image'], 'notes.png', { type: 'image/png' }))

    const typed = await withDetectedImageTypes(form)
    const [png, text] = typed.getAll('files')

    expect(typed.get('comment')).toBe('Fixed.')
    expect([png.name, png.type, png.size]).toEqual(['fix.jpg', 'image/png', PNG_1x1.length])
    expect([text.name, text.type]).toEqual(['notes.png', ''])
  })
})
