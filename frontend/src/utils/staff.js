// Event Admins (SRS: event staff), see GET/POST /events/{id}/staff in
// docs/BACKEND_MVP_API.md. Owners grant check-in and/or support rights.

export const PERMISSIONS = {
  can_check_in: 'Check-in (mobile scanner)',
  can_manage_support: 'Support cases',
}

export function permissionLabels(assignment) {
  return Object.entries(PERMISSIONS)
    .filter(([key]) => assignment[key])
    .map(([, label]) => label)
}

export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase()

// Front-end checks before POST; the API still has the final word.
export function validateStaffForm(form, staff, ownerEmail) {
  const email = normalizeEmail(form.email)
  if (!email) return { email: 'Enter the email of an existing BiletFlow account.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { email: 'Enter a valid email address.' }
  if (email === normalizeEmail(ownerEmail)) return { email: 'You already manage this event as its organizer.' }
  if (staff.some((a) => normalizeEmail(a.user_email) === email)) {
    return { email: 'This person is already an Event Admin here.' }
  }
  if (!form.can_check_in && !form.can_manage_support) {
    return { permissions: 'Give at least one permission.' }
  }
  return {}
}

// People a support case can be assigned to: the current user (owner or
// platform admin) plus Event Admins with support rights, without duplicates.
export function supportAssignees(user, staff) {
  const people = [{ id: user.id, email: user.email, label: `Me (${user.email})` }]
  for (const a of staff) {
    if (a.can_manage_support && a.user !== user.id) {
      people.push({ id: a.user, email: a.user_email, label: a.user_email })
    }
  }
  return people
}
