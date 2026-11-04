// The evidence rules of O4 (DESIGN §2, §4), checked before anything is sent (AC 5.2).
// The messages are the backend's, so a server error reads the same as a local one.

export const MAX_PHOTOS = 5
export const MAX_FILE_BYTES = 5 * 1024 * 1024
// OwnerService.MAX_COMMENT_LENGTH; the textarea stops there, so its hint says so.
export const MAX_COMMENT_LENGTH = 1000
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'

export const EVIDENCE_MESSAGES = {
  comment: 'Describe how you fixed the issue.',
  required: 'Evidence is required.',
  tooMany: 'Upload at most 5 files.',
  tooLarge: 'Each file must be 5 MB or smaller.',
  wrongType: 'Evidence must be a JPEG, PNG or WebP image.',
}

const startsWith = (bytes, offset, prefix) =>
  prefix.every((value, index) => bytes[offset + index] === value)

const ascii = (text) => [...text].map((char) => char.charCodeAt(0))

/** The image type of a file's first bytes, as ImageFiles detects it, or null. */
export function imageType(bytes) {
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  // RIFF, a 4-byte size, then WEBP.
  if (startsWith(bytes, 0, ascii('RIFF')) && startsWith(bytes, 8, ascii('WEBP'))) return 'image/webp'
  return null
}

async function isImage(file) {
  try {
    return imageType(new Uint8Array(await file.slice(0, 12).arrayBuffer())) !== null
  } catch {
    // The file could not be read, e.g. it was deleted after it was picked.
    return false
  }
}

/** The files the backend counts: it ignores empty ones, as an untouched file input sends. */
export function evidenceFiles(files) {
  return files.filter((file) => file.size > 0)
}

/** Field errors for { comment, files } in the backend's order; the type is read from each file's first bytes. */
export async function validateEvidence({ comment, files: picked }) {
  const errors = {}
  const files = evidenceFiles(picked)
  if (!comment.trim()) errors.comment = EVIDENCE_MESSAGES.comment
  if (files.length === 0) errors.files = EVIDENCE_MESSAGES.required
  else if (files.some((file) => file.size > MAX_FILE_BYTES)) errors.files = EVIDENCE_MESSAGES.tooLarge
  else if (files.length > MAX_PHOTOS) errors.files = EVIDENCE_MESSAGES.tooMany
  else if (!(await Promise.all(files.map(isImage))).every(Boolean)) {
    errors.files = EVIDENCE_MESSAGES.wrongType
  }
  return errors
}
