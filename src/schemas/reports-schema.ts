import type { CollectionSchema } from 'deepspace/schema'

export const REPORT_SAMPLES_MAX_BYTES = 200_000
// shortcut: sample size is client-enforced because 0.44.2 maxLength rejects structured JSON; move it server-side when JSON byte limits are supported.

export const reportsSchema: CollectionSchema = {
  name: 'reports',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, maxLength: 200 },
    { name: 'description', storage: 'text', interpretation: 'plain', maxLength: 2_000 },
    { name: 'baselineLabel', storage: 'text', interpretation: 'plain', required: true, maxLength: 200 },
    { name: 'candidateLabel', storage: 'text', interpretation: 'plain', required: true, maxLength: 200 },
    { name: 'samples', storage: 'text', interpretation: { kind: 'json' }, required: true },
    { name: 'threshold', storage: 'number', interpretation: 'plain', required: true },
    { name: 'reviewers', storage: 'text', interpretation: { kind: 'json' }, required: true, default: [] },
    { name: 'reviewStatus', storage: 'text', interpretation: { kind: 'select', options: ['pending', 'accepted', 'investigate'] }, required: true, default: 'pending' },
  ],
  collaboratorsField: 'reviewers',
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: 'shared', create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
