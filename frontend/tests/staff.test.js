import { test } from 'node:test'
import assert from 'node:assert/strict'
import { permissionLabels, supportAssignees, validateStaffForm } from '../src/utils/staff.js'

const staff = [
  { id: 1, user: 11, user_email: 'Scanner@Example.com', can_check_in: true, can_manage_support: false },
  { id: 2, user: 12, user_email: 'help@example.com', can_check_in: false, can_manage_support: true },
]

test('permission labels list only granted rights', () => {
  assert.deepEqual(permissionLabels(staff[0]), ['Check-in (mobile scanner)'])
  assert.deepEqual(permissionLabels({ can_check_in: true, can_manage_support: true }).length, 2)
  assert.deepEqual(permissionLabels({}), [])
})

test('the add form rejects bad, duplicate and own emails and empty rights', () => {
  const ok = { email: ' new@example.com ', can_check_in: true, can_manage_support: false }
  assert.deepEqual(validateStaffForm(ok, staff, 'owner@example.com'), {})
  assert.ok(validateStaffForm({ ...ok, email: '' }, staff, 'owner@example.com').email)
  assert.ok(validateStaffForm({ ...ok, email: 'not-an-email' }, staff, 'owner@example.com').email)
  assert.ok(validateStaffForm({ ...ok, email: 'scanner@example.COM' }, staff, 'owner@example.com').email)
  assert.ok(validateStaffForm({ ...ok, email: 'Owner@example.com' }, staff, 'owner@example.com').email)
  assert.ok(validateStaffForm({ ...ok, can_check_in: false }, staff, 'owner@example.com').permissions)
})

test('support cases can go to the current user or Event Admins with support rights', () => {
  const people = supportAssignees({ id: 10, email: 'owner@example.com' }, staff)
  assert.deepEqual(people.map((p) => p.id), [10, 12])
  assert.equal(people[0].label, 'Me (owner@example.com)')
  // A platform admin who is also listed as staff is not shown twice.
  const admin = supportAssignees({ id: 12, email: 'help@example.com' }, staff)
  assert.deepEqual(admin.map((p) => p.id), [12])
})
