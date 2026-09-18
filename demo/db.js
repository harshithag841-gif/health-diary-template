// Demo-only adapter. Records and drafts live in memory for this page, never IndexedDB.
import { blankEntry, localDate } from './model.js';

const entries = new Map(), visits = new Map(), files = new Map();
const clone = value => structuredClone(value);
const day = offset => { const date = new Date(); date.setDate(date.getDate() + offset); return localDate(date); };
const updatedAt = new Date().toISOString();
const samples = [
  [0, 4, 'FICTIONAL SAMPLE\n\n8:30 am — Slept well and had breakfast.\n1:00 pm — Took a short walk after lunch.\n6:00 pm — Wrote down a question for my next appointment.', 'No new symptoms recorded in this example.', 'No medicines recorded in this example.', 'Which details would be useful to track before our next visit?'],
  [-1, 3, 'FICTIONAL SAMPLE\n\nA busy day at work. Felt tired in the afternoon. Made a note of the time so I can remember it later.', 'Tired around 3:00 pm; noted the time and duration.', '', 'Should I bring a summary of my sleep and energy notes?'],
  [-3, 4, 'FICTIONAL SAMPLE\n\nVisited the sample clinic at 10:30 am. Saved the visit details and a demo attachment. Took a quiet evening to catch up on notes.', '', 'Use this field for what your own clinician prescribed.', 'What should I bring to the follow-up?'],
  [-6, 3, 'FICTIONAL SAMPLE\n\nNoticed a mild headache after a long afternoon at my desk. Wrote down when it happened, rather than trying to remember it next week.', 'Headache at 4:00 pm, about 20 minutes. Example only.', '', 'Is there anything else I should include in these notes?']
];
for (const [offset, mood, notes, symptoms, medicines, questions] of samples) {
  const date = day(offset);
  entries.set(date, { ...blankEntry(date), mood, notes, symptoms, medicines, questions, updatedAt });
}
const fileId = 'demo-prescription';
let ready;
export function openDatabase() {
  return ready ||= (async () => {
    const response = await fetch('/sample-prescription.png');
    if (!response.ok) throw new Error('The sample attachment could not load. Please refresh.');
    const blob = await response.blob();
    files.set(fileId, blob);
    visits.set('demo-visit-1', { id: 'demo-visit-1', date: day(-3), time: '10:30', doctor: 'Dr. Taylor — fictional example', updatedAt, attachments: [{id: fileId, name: 'DEMO-only-sample.png', type: 'image/png', size: blob.size}] });
    visits.set('demo-visit-2', { id: 'demo-visit-2', date: day(-6), time: '16:00', doctor: 'Dr. Morgan — fictional example', updatedAt, attachments: [] });
  })();
}
export const demoStorage = {
  getItem(key) { return Object.hasOwn(this, key) ? this[key] : null; },
  setItem(key, value) { this[key] = String(value); },
  removeItem(key) { delete this[key]; }
};
function checkRevision(saved, expected) {
  if ((saved?.updatedAt || null) !== expected) throw new Error('This sample changed. Reopen it and try again.');
}
export async function getEntry(date) { await openDatabase(); return clone(entries.get(date) || null); }
export async function allEntries() { await openDatabase(); return clone([...entries.values()].sort((a,b) => b.date.localeCompare(a.date))); }
export async function putEntry(entry, expected) { await openDatabase(); checkRevision(entries.get(entry.date), expected); entries.set(entry.date, clone(entry)); return clone(entry); }
export async function deleteEntry(date, expected) { await openDatabase(); checkRevision(entries.get(date), expected); entries.delete(date); }
export async function allVisits() { await openDatabase(); return clone([...visits.values()].sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time))); }
export async function getPrescription(id) { await openDatabase(); if (!files.has(id)) throw new Error('Sample attachment not found. Reset the demo to restore it.'); return files.get(id); }
export async function saveVisit(visit, addedFiles, expected) {
  await openDatabase(); checkRevision(visits.get(visit.id), expected);
  const retained = new Set(visit.attachments.map(file => file.id));
  for (const file of visits.get(visit.id)?.attachments || []) if (!retained.has(file.id)) files.delete(file.id);
  for (const file of addedFiles) files.set(file.id, file.blob);
  visits.set(visit.id, clone(visit)); return clone(visit);
}
export async function deleteVisit(visit) {
  await openDatabase(); checkRevision(visits.get(visit.id), visit.updatedAt);
  for (const file of visit.attachments) files.delete(file.id);
  visits.delete(visit.id);
}
// Real backup imports are disabled in this demo, including at the adapter boundary.
export async function restoreDiary() { throw new Error('Restore a backup only in your own deployed diary.'); }
export const restoreEntries = restoreDiary;
