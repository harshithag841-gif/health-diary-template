import { openDatabase, getEntry, allEntries, putEntry, deleteEntry, allVisits, restoreDiary } from './db.js';
import { fields, moodNames, localDate, validDate, prettyDate, blankEntry, hasContent, validateBackup, makeReportText } from './model.js';
import { initVisits, renderVisits, hasUnsavedVisit, setVisitsReady } from './visits.js';
import { exportVisits, parseVisitBackup, MAX_BACKUP_BYTES, readableTime } from './visit-model.js';

const $ = id => document.getElementById(id);
let current = blankEntry(localDate()), dirty = false, generation = 0, saveTimer, toastTimer, installPrompt, offlineReady = false;
let saveQueue = Promise.resolve(), activeView = 'today', reportEntries = [], reportVisits = [], storageReady = false, loadingDate = false;
const draftPrefix = 'health-diary-draft:';
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('health-diary-changes') : null;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function showError(message) { $('error-banner').textContent = message; $('error-banner').hidden = false; }
function clearError() { $('error-banner').hidden = true; }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 4000); }
function status(message) { $('save-status').textContent = message; }
function updateNotesDisclosure() {
  $('notes-toggle-label').textContent=$('notes-details').open?'Collapse':'Open';
  $('notes-hint').textContent=$('notes-details').open?'Small details count, too.':'Open to read or add more.';
}
function rememberNotesDisclosure() {
  try{localStorage.setItem('health-diary-notes-open:'+current.date,String($('notes-details').open));}catch{}
  updateNotesDisclosure();
}
function readForm() { return { ...current, ...Object.fromEntries(fields.map(key => [key,$(key).value])) }; }
function keepDraft(entry) {
  try { localStorage.setItem(draftPrefix + entry.date, JSON.stringify({ entry, base:current.updatedAt })); }
  catch { /* IndexedDB is the primary store; its failures are shown to the user. */ }
}
function removeDraft(date) { try { localStorage.removeItem(draftPrefix + date); } catch {} }
function changed() {
  if (!storageReady || loadingDate) return;
  dirty = true; generation++; current = readForm(); keepDraft(current); status('Saving…'); clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveCurrent(), 350);
}
async function saveCurrent() {
  clearTimeout(saveTimer);
  saveQueue = saveQueue.then(async () => {
    if (!dirty) return true;
    const snapshot = readForm(), revision = generation;
    const expected = current.updatedAt;
    // Do not create entries for untouched, empty days.
    if (!hasContent(snapshot) && !expected) { dirty = false; removeDraft(snapshot.date); status('Ready when you are'); return true; }
    snapshot.updatedAt = new Date().toISOString();
    if (snapshot.updatedAt === expected) snapshot.updatedAt = new Date(Date.parse(expected)+1).toISOString();
    try {
      await putEntry(snapshot, expected);
      current.updatedAt = snapshot.updatedAt;
      if (generation === revision) { dirty = false; removeDraft(snapshot.date); status('Saved on this device ✓'); }
      else { keepDraft(readForm()); status('Saving…'); }
      $('delete-entry').hidden = false;
      clearError(); channel?.postMessage({date:snapshot.date});
      return true;
    } catch (error) { status('Not saved'); showError(error.message); return false; }
  }).catch(error => { showError(error.message); return false; });
  return saveQueue;
}
async function flush() {
  if (!await saveCurrent()) return false;
  return dirty ? saveCurrent() : true;
}
function paintEntry() {
  let notePreference;
  try{notePreference=localStorage.getItem('health-diary-notes-open:'+current.date);}catch{}
  $('notes-details').open=notePreference===null||notePreference===undefined?!current.notes.trim():notePreference==='true';
  updateNotesDisclosure();
  $('entry-date').value = current.date;
  $('day-label').textContent = current.date === localDate() ? 'TODAY' : prettyDate(current.date,true).toUpperCase();
  $('entry-heading').textContent = current.date === localDate() ? 'How was your day?' : 'A day to remember';
  fields.forEach(key => $(key).value = current[key]);
  document.querySelectorAll('[data-mood]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.mood) === current.mood)));
  $('extra-details').open = fields.slice(1).some(key => current[key].trim());
  $('delete-entry').hidden = !current.updatedAt;
  status(current.updatedAt ? 'Saved on this device ✓' : 'Ready when you are');
}
async function loadDate(date) {
  if (!validDate(date)) { $('entry-date').value = current.date; return; }
  if (loadingDate) return;
  if (!await flush()) { $('entry-date').value = current.date; return; }
  loadingDate = true; $('entry-form').inert = true;
  try { current = await getEntry(date) || blankEntry(date); dirty = false; paintEntry(); clearError(); }
  catch (error) { showError('Could not read your diary. Please reload. ' + error.message); }
  finally { loadingDate = false; $('entry-form').inert = false; }
}
async function switchView(view) {
  if (!['today','journal','doctor'].includes(view)) view = 'today';
  if (!await flush()) { history.replaceState(null,'',`#${activeView}`); return; }
  activeView = view;
  for (const name of ['today','journal','doctor']) $(`${name}-view`).hidden = name !== view;
  document.querySelectorAll('[data-view]').forEach(link => link.dataset.view === view ? link.setAttribute('aria-current','page') : link.removeAttribute('aria-current'));
  if (view === 'journal') await renderJournal();
  if (view === 'doctor') { await renderVisits(); await renderReport(); }
}
async function renderJournal() {
  try {
    const query = $('search').value.trim().toLocaleLowerCase();
    const entries = (await allEntries()).filter(entry => hasContent(entry) && `${entry.date} ${prettyDate(entry.date)} ${fields.map(key => entry[key]).join(' ')} ${moodNames[entry.mood] || ''}`.toLocaleLowerCase().includes(query));
    $('entry-count').textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}${query ? ' found' : ''}`;
    $('entries-list').replaceChildren();
    if (!entries.length) {
      const empty = element('div',undefined,'empty');
      empty.append(element('h2',query ? 'No matching entries' : 'Your story starts with today'),element('p',query ? 'Try a different word or date.' : 'Even a few words can help you remember later.'));
      if (!query) { const link = element('a','Write your first note','primary'); link.href='#today'; empty.append(link); }
      $('entries-list').append(empty);
    }
    for (const entry of entries) {
      const card = element('button',undefined,'entry-card'); card.type='button';
      const header = element('div',undefined,'entry-card-header'); header.append(element('h2',prettyDate(entry.date,true)));
      if (entry.mood) header.append(element('span',moodNames[entry.mood],'badge'));
      const preview = fields.map(key => entry[key]).find(value => value.trim()) || 'Feeling ' + moodNames[entry.mood].toLowerCase();
      card.append(header,element('p',preview.slice(0,190)+(preview.length > 190 ? '…' : '')));
      if (entry.questions.trim()) card.append(element('p','Question for your doctor','question-hint'));
      card.addEventListener('click',async () => { await loadDate(entry.date); location.hash='today'; });
      $('entries-list').append(card);
    }
  } catch (error) { showError('Could not load entries. ' + error.message); }
}
function validRange() {
  const from=$('report-from').value, to=$('report-to').value;
  return validDate(from) && validDate(to) && from <= to;
}
async function renderReport() {
  const container = $('report-content'); container.replaceChildren();
  reportEntries = []; reportVisits = [];
  if (!validRange()) { container.append(element('p','Choose a valid date range. The end date must be on or after the start date.')); $('print-report').disabled=$('download-report').disabled=true; return; }
  const from=$('report-from').value, to=$('report-to').value;
  try {
    reportEntries=(await allEntries()).filter(entry => hasContent(entry) && entry.date >= from && entry.date <= to).reverse();
    reportVisits=(await allVisits()).filter(visit=>visit.date>=from && visit.date<=to).reverse();
  }
  catch (error) { showError(error.message); return; }
  $('print-report').disabled=$('download-report').disabled=!reportEntries.length&&!reportVisits.length;
  container.append(element('h2','My health diary'),element('p',`${prettyDate(from,true)} – ${prettyDate(to,true)} · ${reportEntries.length} recorded ${reportEntries.length===1?'day':'days'}`,'report-meta'));
  if (!reportEntries.length && !reportVisits.length) { container.append(element('p','No entries or visits in this date range yet.')); return; }
  container.append(element('p','Personal notes, as written. Days without an entry are not included.','report-meta'));
  if(reportVisits.length){
    const section=element('section',undefined,'report-visits');section.append(element('h3','Doctor visits'));
    for(const visit of reportVisits){
      const item=element('div',undefined,'report-visit');item.append(element('h4',visit.doctor),element('p',`${prettyDate(visit.date,true)} · ${readableTime(visit.time)}`));
      if(visit.attachments.length)item.append(element('p','Prescriptions: '+visit.attachments.map(file=>file.name).join(', ')));
      section.append(item);
    }
    section.append(element('p','Prescription files are available separately in the diary; they are not embedded in this report.','report-meta'));container.append(section);
  }
  const questions=reportEntries.filter(entry=>entry.questions.trim());
  if(questions.length) { const section=element('section',undefined,'question-section');section.append(element('h3','Questions for my doctor'));const list=element('ul');questions.forEach(entry=>list.append(element('li',`${prettyDate(entry.date,true)} — ${entry.questions}`)));section.append(list);container.append(section); }
  for(const entry of reportEntries) {
    const section=element('article',undefined,'report-entry');section.append(element('h3',prettyDate(entry.date)));
    if(entry.mood) section.append(element('span',`Feeling: ${moodNames[entry.mood]}`,'badge'));
    for(const [key,label] of [['notes','My notes'],['symptoms','Symptoms'],['medicines','Medicines & treatments'],['questions','Questions for my doctor']]) if(entry[key].trim()) section.append(element('h4',label),element('p',entry[key]));
    container.append(section);
  }
}
function download(contents, name, type) {
  const url=URL.createObjectURL(new Blob([contents],{type})), link=element('a');
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function confirmAction(title,message,label) {
  $('confirm-title').textContent=title;$('confirm-message').textContent=message;$('confirm-ok').textContent=label;
  const dialog=$('confirm-dialog');dialog.returnValue='';dialog.showModal();$('confirm-cancel').focus();
  return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='yes'),{once:true}));
}
function openSettings() {
  try { const last=localStorage.getItem('health-diary-last-backup');$('backup-date').textContent=last?`Last backup download: ${new Date(last).toLocaleString()}`:'No backup downloaded yet.'; } catch {}
  $('settings-dialog').showModal();
}
function connectionStatus() { $('connection-status').textContent = !navigator.onLine ? (offlineReady?'Offline · you can keep writing':'Offline · keep this page open') : offlineReady?'Ready offline':'Preparing offline access…'; }
async function setupOffline() {
  if (!('serviceWorker' in navigator)) { $('connection-status').textContent='Offline access unavailable'; return; }
  try {
    // An already installed worker remains usable even if its update request fails offline.
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing?.active) { offlineReady=true; connectionStatus(); }
    if (!navigator.onLine && offlineReady) return;
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    offlineReady=true;connectionStatus();
    registration.update().catch(()=>{});
  } catch { if(offlineReady) connectionStatus(); else $('connection-status').textContent='Open online to enable offline access'; }
}
async function recoverDrafts() {
  let recovered=0;
  try {
    for(const key of Object.keys(localStorage).filter(key=>key.startsWith(draftPrefix))) {
      let draft;
      try { draft=JSON.parse(localStorage.getItem(key));validateBackup({app:'my-health-diary',version:1,entries:[draft.entry]}); } catch { continue; }
      const stored=await getEntry(draft.entry.date);
      if(fields.every(field=>stored?.[field]===draft.entry[field]) && stored?.mood===draft.entry.mood) { removeDraft(draft.entry.date);continue; }
      if((stored?.updatedAt||null)!==(draft.base||null)) { showError('An unsaved draft conflicts with a newer entry. Download a backup in Settings to keep a copy of the draft before making changes.');continue; }
      if(hasContent(draft.entry) || stored) { await putEntry({...draft.entry,updatedAt:new Date().toISOString()},stored?.updatedAt||null);recovered++; }
      removeDraft(draft.entry.date);
    }
  } catch { showError('An earlier draft could not be recovered. Download a backup before closing this page.'); }
  if(recovered) toast('Recovered your last unsaved notes.');
}
fields.forEach(key=>$(key).addEventListener('input',changed));
$('notes-details').addEventListener('toggle',updateNotesDisclosure);
$('notes-details').querySelector('summary').addEventListener('click',event=>{event.preventDefault();$('notes-details').open=!$('notes-details').open;rememberNotesDisclosure();if(!$('notes-details').open&&dirty)saveCurrent();});
document.querySelectorAll('[data-mood]').forEach(button=>button.addEventListener('click',()=>{current.mood=current.mood===Number(button.dataset.mood)?null:Number(button.dataset.mood);document.querySelectorAll('[data-mood]').forEach(item=>item.setAttribute('aria-pressed',String(Number(item.dataset.mood)===current.mood)));changed();}));
$('entry-form').addEventListener('submit',async event=>{event.preventDefault();if(await flush()){toast(hasContent(current)?'Entry saved on this device':'Add a note or choose how you feel first.');if(hasContent(current)){navigator.storage?.persist?.().catch(()=>{});if(current.notes.trim()){$('notes-details').open=false;rememberNotesDisclosure();}}}});
$('entry-date').addEventListener('change',()=>loadDate($('entry-date').value));
$('add-time').addEventListener('click',()=>{const input=$('notes'),time=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});const label=(input.value && input.selectionStart>0?'\n\n':'')+time+' — ';input.setRangeText(label,input.selectionStart,input.selectionEnd,'end');input.focus();changed();});
$('delete-entry').addEventListener('click',async()=>{
  if(!await flush())return;
  if(!await confirmAction('Delete this entry?',`Your notes for ${prettyDate(current.date,true)} will be removed from this device. Download a backup first if you want to keep a copy.`,'Delete entry'))return;
  try {await deleteEntry(current.date,current.updatedAt);removeDraft(current.date);channel?.postMessage({date:current.date});current=blankEntry(current.date);dirty=false;paintEntry();toast('Entry deleted.');}catch(error){showError(error.message);}
});
$('search').addEventListener('input',renderJournal);
for(const id of ['report-from','report-to'])$(id).addEventListener('change',renderReport);
$('print-report').addEventListener('click',()=>{if((reportEntries.length||reportVisits.length) && validRange())window.print();});
$('download-report').addEventListener('click',()=>{if((reportEntries.length||reportVisits.length) && validRange())download(makeReportText(reportEntries,$('report-from').value,$('report-to').value,reportVisits),`health-diary-${$('report-from').value}-to-${$('report-to').value}.txt`,'text/plain;charset=utf-8');});
$('settings-button').addEventListener('click',openSettings);$('backup-shortcut').addEventListener('click',openSettings);
$('close-settings').addEventListener('click',()=>$('settings-dialog').close());
$('confirm-cancel').addEventListener('click',()=>$('confirm-dialog').close('no'));$('confirm-ok').addEventListener('click',()=>$('confirm-dialog').close('yes'));
$('export-backup').addEventListener('click',async()=>{
  if(hasUnsavedVisit()){toast('Save or cancel your visit changes before downloading a backup.');return;}
  $('export-backup').disabled=true;
  // Include unsaved drafts too, even if saving failed, so notes remain recoverable.
  await flush();
  try {
    const entries=await allEntries();
    if(dirty) {const value=readForm(),index=entries.findIndex(entry=>entry.date===value.date);if(index>=0)entries[index]=value;else entries.push(value);}
    const drafts=[];try{for(const key of Object.keys(localStorage).filter(key=>key.startsWith(draftPrefix)))drafts.push(JSON.parse(localStorage.getItem(key)));}catch{}
    const now=new Date().toISOString();
    const visits=await exportVisits(await allVisits());
    const backup=JSON.stringify({app:'my-health-diary',version:2,exportedAt:now,entries,visits,drafts});
    if(new Blob([backup]).size>MAX_BACKUP_BYTES)throw new Error('This backup exceeds 150 MB. Download older prescriptions separately before removing them from the diary.');
    download(backup,`my-health-diary-backup-${localDate()}.json`,'application/json');
    try{localStorage.setItem('health-diary-last-backup',now);}catch{}
    $('backup-date').textContent=`Last backup download: ${new Date(now).toLocaleString()}`;toast('Backup download started.');
  }catch(error){toast('Backup failed: '+error.message);}finally{$('export-backup').disabled=false;}
});
$('import-backup').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  try{
    if(hasUnsavedVisit())throw new Error('Save or cancel your visit changes before restoring a backup.');
    if(file.size>MAX_BACKUP_BYTES)throw new Error('This file is too large. Choose a diary backup smaller than 150 MB.');
    const backup=JSON.parse(await file.text()),entries=validateBackup(backup),{visits,files}=parseVisitBackup(backup);
    if(!entries.length&&!visits.length){toast('This backup has no entries or visits.');return;}
    if(!await flush())return;
    const existing=new Set((await allEntries()).map(entry=>entry.date)), overlap=entries.filter(entry=>existing.has(entry.date)).length;
    const existingVisits=new Set((await allVisits()).map(visit=>visit.id)),visitOverlap=visits.filter(visit=>existingVisits.has(visit.id)).length;
    if(!await confirmAction('Restore this backup?',`Restore ${entries.length} diary entries, ${visits.length} visits, and ${files.length} prescription files? ${overlap||visitOverlap?`${overlap} matching diary dates and ${visitOverlap} matching visits will be replaced. Download a current backup first if you want to keep both versions.`:'Your existing records will be kept.'}`,'Restore backup'))return;
    await restoreDiary(entries,visits,files);entries.forEach(entry=>removeDraft(entry.date));await loadDate(current.date);await switchView(activeView);channel?.postMessage({date:'all'});toast('Backup restored.');
  }catch(error){toast(error instanceof SyntaxError?'This file is not a valid diary backup.':error.message);}
});
window.addEventListener('hashchange',()=>{if(storageReady)switchView(location.hash.slice(1));});
window.addEventListener('online',connectionStatus);window.addEventListener('offline',connectionStatus);
window.addEventListener('beforeunload',event=>{if(dirty)keepDraft(readForm());if(dirty||hasUnsavedVisit()){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden && dirty)saveCurrent();});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('install-app').hidden=false;});
$('install-app').addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('install-app').hidden=true;}});
window.addEventListener('appinstalled',()=>{$('install-app').hidden=true;toast('Added to your home screen.');});
if(channel)channel.onmessage=async event=>{if(!dirty&&(event.data.date===current.date||event.data.date==='all'))await loadDate(current.date);if(activeView==='journal')renderJournal();if(activeView==='doctor'){renderVisits();renderReport();}};

async function init() {
  initVisits({toast,confirmAction,onChange:async()=>{channel?.postMessage({date:'visits'});if(activeView==='doctor')await renderReport();}});
  $('entry-form').inert=true;
  const today=new Date(), from=new Date(today);from.setDate(today.getDate()-29);$('report-from').value=localDate(from);$('report-to').value=localDate(today);
  paintEntry();setupOffline();
  try {
    await openDatabase();await recoverDrafts();current=await getEntry(localDate())||blankEntry(localDate());paintEntry();storageReady=true;$('entry-form').inert=false;setVisitsReady(true);
    await switchView(location.hash.slice(1)||'today');
  }catch(error){showError('Your browser could not open diary storage. Try a regular browser window with storage enabled. '+error.message);status('Storage unavailable');}
  // A small, optional navigation tool for browsers that support WebMCP.
  const context=document.modelContext;
  if(context?.registerTool) {
    const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
    try{await context.registerTool({name:'open_diary_day',title:'Open diary day',description:'Open an existing day or a blank daily entry. Does not create an entry until the user writes.',inputSchema:{type:'object',properties:{date:{type:'string',description:'Date in YYYY-MM-DD format'}},required:['date'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async input=>{if(!storageReady||!input||!validDate(input.date))throw new Error('A valid YYYY-MM-DD date and available diary storage are required.');if(!await flush())throw new Error('Save the current notes first.');await loadDate(input.date);location.hash='today';await switchView('today');return{date:current.date,view:'today'};}},{signal:lifecycle.signal});}catch{/* Optional API; the diary works without it. */}
  }
}
init();
