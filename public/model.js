export const moodNames = ['','Rough','Not great','Okay','Good','Great'];
export const fields = ['notes', 'symptoms', 'medicines', 'questions'];
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDate(date) === value;
}
export function prettyDate(value, short = false) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, short ? { day:'numeric', month:'short', year:'numeric' } : { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}
export function blankEntry(date) { return { date, mood:null, notes:'', symptoms:'', medicines:'', questions:'', updatedAt:null }; }
export function hasContent(entry) { return !!entry.mood || fields.some(key => entry[key].trim()); }
export function validateBackup(value) {
  if (!value || value.app !== 'my-health-diary' || ![1,2].includes(value.version) || !Array.isArray(value.entries) || value.entries.length > 40000) throw new Error('This is not a supported Your Health Diary backup. Choose a backup downloaded from this app.');
  const dates = new Set();
  return value.entries.map(entry => {
    if (!entry || !validDate(entry.date) || dates.has(entry.date) || !(entry.mood === null || Number.isInteger(entry.mood) && entry.mood >= 1 && entry.mood <= 5) || fields.some(key => typeof entry[key] !== 'string' || entry[key].length > (key === 'notes' ? 100000 : 20000))) throw new Error('This backup has invalid or duplicate entries. Nothing was restored.');
    dates.add(entry.date);
    return { date: entry.date, mood:entry.mood, ...Object.fromEntries(fields.map(key => [key, entry[key]])), updatedAt:new Date().toISOString() };
  });
}
export function makeReportText(entries, from, to, visits = []) {
  const lines = ['YOUR HEALTH DIARY', `${prettyDate(from,true)} – ${prettyDate(to,true)}`, `${entries.length} recorded ${entries.length === 1 ? 'day' : 'days'}`, 'Personal notes, as written. Days without an entry are not included.', ''];
  const questions = entries.filter(entry => entry.questions.trim());
  if (visits.length) {
    lines.push('DOCTOR VISITS');
    for (const visit of visits) {
      lines.push(`${prettyDate(visit.date,true)}${visit.time ? ' at '+visit.time : ''} — ${visit.doctor}`);
      if (visit.attachments.length) lines.push('Prescriptions: '+visit.attachments.map(file=>file.name).join(', '));
      lines.push('');
    }
    lines.push('Prescription files are available separately in the diary; they are not embedded in this report.', '');
  }
  if (questions.length) {
    lines.push('QUESTIONS FOR MY DOCTOR');
    questions.forEach(entry => lines.push(`${prettyDate(entry.date,true)}: ${entry.questions}`, ''));
  }
  for (const entry of entries) {
    lines.push(prettyDate(entry.date), '─'.repeat(35));
    if (entry.mood) lines.push(`Feeling: ${moodNames[entry.mood]}`);
    for (const [key,label] of [['notes','My notes'],['symptoms','Symptoms'],['medicines','Medicines & treatments'],['questions','Questions for my doctor']]) {
      if (entry[key].trim()) lines.push(`${label}\n${entry[key]}`, '');
    }
    lines.push('');
  }
  return lines.join('\n');
}
