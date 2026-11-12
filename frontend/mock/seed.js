import {
  addDays,
  approve,
  publicUser,
  recordFollowUpResult,
  reject,
  review,
  scheduleFollowUp,
  scheduleFollowUpInspection,
  startRegular,
  submitEvidence,
  submitInspection,
} from './data.js'

// The same data as V2, V4 and the backend's DemoDataSeeder (DESIGN §5), with dates relative to today.

export const SEED_STORES = [
  { id: '1', name: 'Blue Plate Diner', address: '412 Main St' },
  { id: '2', name: 'Harbor Noodle House', address: '88 Wharf Ave' },
  { id: '3', name: 'Corner Bakery Co.', address: '1500 Grand Blvd' },
]

export const CHECKLIST = [
  'Cold food is held at 41°F (5°C) or below and hot food at 135°F (57°C) or above.',
  'Raw meat is stored below and apart from ready-to-eat food.',
  'Handwashing sinks are accessible and stocked with soap and paper towels.',
  'Food handlers wear clean clothing and hair restraints.',
  'Food-contact surfaces and utensils are clean and sanitized.',
  'There is no sign of pests.',
  'Stored food is labeled and within its use-by date.',
  'Garbage is kept in covered bins and removed regularly.',
]

export const DEMO_PASSWORD = 'audeat-demo'

export const DEMO_USERS = [
  demoUser(1, 'Ivy Inspector', 'inspector@audeat.test', null),
  demoUser(2, 'Bea Owner', 'owner.blueplate@audeat.test', 'Blue Plate Diner'),
  demoUser(3, 'Cora Owner', 'owner.corner@audeat.test', 'Corner Bakery Co.'),
  demoUser(4, 'Hal Owner', 'owner.harbor@audeat.test', 'Harbor Noodle House'),
]

/** Session users and fixed bearer tokens, so unit tests can call protected routes. */
export const MOCK_USERS = {
  inspector: publicUser(DEMO_USERS[0]),
  owner: publicUser(DEMO_USERS[1]),
  otherOwner: publicUser(DEMO_USERS[2]),
}

export const MOCK_TOKENS = { inspector: 'mock-inspector', owner: 'mock-owner-blueplate', otherOwner: 'mock-owner-corner' }

export const PNG_1x1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (char) => char.charCodeAt(0),
)

function demoUser(id, name, email, storeName) {
  const store = SEED_STORES.find((item) => item.name === storeName)
  return {
    id,
    name,
    email,
    role: store ? 'owner' : 'inspector',
    storeId: store?.id ?? null,
    storeName: store?.name ?? null,
    password: DEMO_PASSWORD,
  }
}

export function seedDatabase(db, today) {
  for (const [index, description] of CHECKLIST.entries()) {
    db.insert('checklistRequirements', { sortOrder: index + 1, description })
  }

  const store = (name) => db.stores.find((item) => item.name === name)
  const [bluePlate, corner] = [store('Blue Plate Diner'), store('Corner Bakery Co.')]
  if (!bluePlate || !corner || !store('Harbor Noodle House')) return

  for (const user of DEMO_USERS) {
    db.insert('users', { ...user, storeId: user.storeName && store(user.storeName).id })
  }
  const ivy = db.users[0]
  const day = (offset) => addDays(today, offset)
  const at = (offset) => `${day(offset)}T15:00:00Z`

  // A submitted regular inspection; `flagged` maps checklist numbers to the inspector's comment.
  function inspection(storeRow, offset, flagged = {}) {
    const row = startRegular(db, storeRow, ivy, day(offset), at(offset))
    const results = {}
    for (const result of db.inspectionResults.filter((item) => item.inspectionId === row.id)) {
      result.compliant = !(result.requirementId in flagged)
      result.comment = flagged[result.requirementId] ?? null
      results[result.requirementId] = result
    }
    submitInspection(row, ivy, day(offset), at(offset))
    return results
  }

  function photo(parent, offset) {
    db.insert('photos', {
      resultId: null,
      submissionId: null,
      ...parent,
      contentType: 'image/png',
      blob: new Blob([PNG_1x1], { type: 'image/png' }),
      createdAt: at(offset),
    })
  }

  function ticket(result, requiredRemediation, deadline, createdOffset) {
    return db.insert('remediationTickets', {
      resultId: result.id,
      requiredRemediation,
      deadline: day(deadline),
      status: 'open',
      createdAt: at(createdOffset),
      approvedAt: null,
    })
  }

  function evidence(ticketRow, comment, offset) {
    submitEvidence(ticketRow)
    const submission = db.insert('remediationSubmissions', {
      ticketId: ticketRow.id,
      comment,
      submittedAt: at(offset),
      decision: null,
      reviewComment: null,
      reviewedAt: null,
    })
    photo({ submissionId: submission.id }, offset)
    return submission
  }

  // I1: one issue, fixed and approved (ticket D).
  const i1 = inspection(bluePlate, -60, { 6: 'Mouse droppings behind the dry-storage shelf.' })
  photo({ resultId: i1[6].id }, -60)
  const d = ticket(i1[6], 'Seal the gaps behind the shelf and book a pest-control visit.', -40, -60)
  review(evidence(d, 'Sealed the gaps and the pest-control visit found no activity.', -46), 'approved', null, at(-45))
  approve(d, at(-45))

  // I2: no violations (AC 1.2).
  inspection(bluePlate, -30)

  // I3: six issues covering every ticket status, and one issue without a ticket.
  const i3 = inspection(bluePlate, -10, {
    1: 'Walk-in cooler read 48°F.',
    2: 'Raw chicken stored above salad greens.',
    3: 'No paper towels at the prep sink.',
    4: 'Prep cook working without a hair restraint.',
    5: 'Cutting boards stained and not sanitized.',
    7: 'Unlabeled containers in the walk-in.',
  })
  photo({ resultId: i3[1].id }, -10)
  ticket(i3[1], 'Repair the cooler and log temperatures twice daily.', -2, -10)
  ticket(i3[3], 'Restock the prep sink and check it at every shift change.', 0, -10)
  const c = ticket(i3[5], 'Replace the stained cutting boards and sanitize them after each use.', 5, -10)
  evidence(c, 'Replaced all cutting boards and added a sanitizer log.', -1)
  const e = ticket(i3[7], 'Label and date every container in the walk-in.', 3, -10)
  review(
    evidence(e, 'Labeled every container in the walk-in.', -4),
    'rejected',
    'The photo does not show the labels; please send a close-up.',
    at(-3),
  )
  reject(e)
  const f = ticket(i3[2], 'Store raw meat on the bottom shelf, below ready-to-eat food.', 7, -10)
  review(
    evidence(f, 'Installed new shelving and moved raw chicken to the bottom shelf.', -2),
    'follow_up',
    'I need to see the new shelving in person.',
    at(-1),
  )
  scheduleFollowUp(f)
  // I4: the scheduled follow-up of I3 #2, not done yet.
  scheduleFollowUpInspection(db, i3[2], ivy, day(2), at(-1))

  // I5: one issue, approved through a follow-up (ticket H); I6 is that follow-up.
  const i5 = inspection(corner, -40, { 6: 'Fruit flies near the dish station.' })
  const h = ticket(i5[6], 'Clean the dish-station drain and set fly traps.', -28, -40)
  review(evidence(h, 'Cleaned the drain and set fly traps.', -35), 'follow_up', null, at(-34))
  scheduleFollowUp(h)
  const i6 = scheduleFollowUpInspection(db, i5[6], ivy, day(-30), at(-34))
  Object.assign(db.inspectionResults.find((item) => item.inspectionId === i6.id), {
    compliant: true,
    comment: 'No flies seen; drain cleaned.',
  })
  submitInspection(i6, ivy, day(-30), at(-30))
  recordFollowUpResult(h, true, at(-30))

  // I7: one open issue (ticket G).
  const i7 = inspection(corner, -5, { 8: 'Dumpster lid left open.' })
  ticket(i7[8], 'Keep the dumpster lid closed and empty the bins daily.', 10, -5)
}
