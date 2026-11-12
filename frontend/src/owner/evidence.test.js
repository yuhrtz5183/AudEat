import { describe, expect, it } from 'vitest'
import { PNG_1x1 } from '../../mock/seed.js'
import { MAX_FILE_BYTES, imageType, validateEvidence } from './evidence.js'

const bytes = (...values) => Uint8Array.from(values)
const ascii = (text) => [...text].map((char) => char.charCodeAt(0))
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)
const WEBP = bytes(...ascii('RIFF'), 0x24, 0, 0, 0, ...ascii('WEBPVP8 '))

describe('imageType reads the first bytes, as ImageFiles does', () => {
  it('recognizes JPEG, PNG and WebP', () => {
    expect(imageType(JPEG)).toBe('image/jpeg')
    expect(imageType(PNG_1x1)).toBe('image/png')
    expect(imageType(WEBP)).toBe('image/webp')
  })

  it('refuses anything else, including a RIFF file that is not WebP and a short file', () => {
    expect(imageType(bytes(...ascii('GIF89a')))).toBeNull()
    expect(imageType(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')))).toBeNull()
    expect(imageType(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull()
    expect(imageType(bytes())).toBeNull()
  })
})

describe('validateEvidence (AC 5.2)', () => {
  const file = (content, name = 'fix', type = 'image/png') => new File([content], name, { type })

  it('accepts a comment with JPEG, PNG and WebP photos, whatever their declared type', async () => {
    const files = [file(JPEG, 'a.jpg', 'image/jpeg'), file(PNG_1x1), file(WEBP, 'c', '')]
    expect(await validateEvidence({ comment: 'Fixed it.', files })).toEqual({})
  })

  it('ignores empty files, as the backend does', async () => {
    expect(await validateEvidence({ comment: 'Fixed it.', files: [file('')] })).toEqual({
      files: 'Evidence is required.',
    })
    expect(await validateEvidence({ comment: 'Fixed it.', files: [file(''), file(PNG_1x1)] })).toEqual({})
  })

  it('reports the comment and the files together', async () => {
    expect(await validateEvidence({ comment: ' \n ', files: [] })).toEqual({
      comment: 'Describe how you fixed the issue.',
      files: 'Evidence is required.',
    })
  })

  it('allows exactly 5 MB and 5 photos, and no more', async () => {
    const largest = new File([PNG_1x1, new Uint8Array(MAX_FILE_BYTES - PNG_1x1.length)], 'big.png')
    expect(largest.size).toBe(MAX_FILE_BYTES)
    const five = [largest, ...[1, 2, 3, 4].map(() => file(PNG_1x1))]
    expect(await validateEvidence({ comment: 'Fixed it.', files: five })).toEqual({})
    const tooLarge = new File([PNG_1x1, new Uint8Array(MAX_FILE_BYTES)], 'big.png')
    expect(await validateEvidence({ comment: 'Fixed it.', files: [tooLarge] })).toEqual({
      files: 'Each file must be 5 MB or smaller.',
    })
    expect(await validateEvidence({ comment: 'Fixed it.', files: [...five, file(PNG_1x1)] })).toEqual({
      files: 'Upload at most 5 files.',
    })
  })
})
