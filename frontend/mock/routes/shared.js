import { findById, notFound, photoInspection } from '../data.js'

export const sharedRoutes = [
  // S1: an inspector gets any photo; an owner only one of their own store's submitted inspections.
  {
    method: 'GET',
    pattern: /^\/api\/photos\/(?<photoId>[^/]+)$/,
    role: 'any',
    handler({ db, user }, { photoId }) {
      const photo = findById(db.photos, photoId)
      if (!photo) throw notFound('Photo not found.')
      const inspection = photoInspection(db, photo)
      const visible = user.role === 'inspector'
        || (String(inspection.storeId) === String(user.storeId) && inspection.status === 'submitted')
      if (!visible) throw notFound('Photo not found.')
      return { status: 200, blob: photo.blob }
    },
  },
]
