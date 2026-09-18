import { allVisits, saveVisit, deleteVisit, getPrescription } from './db.js';
import { localDate, prettyDate } from './model.js';
import { validateVisit, prescriptionTypes, MAX_FILE_BYTES, fileSize, readableTime } from './visit-model.js';

const $=id=>document.getElementById(id);
let editing=null,attachments=[],pending=new Map(),unsaved=false,saving=false,previewUrl;
let hooks;
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
export const hasUnsavedVisit=()=>unsaved||saving;
function showError(message){$('visit-error').textContent=message;$('visit-error').hidden=false;}
function changed(){unsaved=true;$('visit-save-status').textContent='Not saved yet';}
function resetEditor() {
  editing=null;attachments=[];pending=new Map();unsaved=false;
  $('visit-form').reset();$('visit-date').value=localDate();$('visit-error').hidden=true;$('visit-save-status').textContent='';
  $('visit-form-title').textContent='Add a doctor visit';$('save-visit').textContent='Save visit';$('visit-editor').open=false;renderPending();
}
function renderPending() {
  const list=$('pending-prescriptions');list.replaceChildren();
  for(const file of attachments){
    const item=node('li'),label=node('span',`${file.name} · ${fileSize(file.size)}`),remove=node('button','Remove','text-button danger');
    remove.type='button';remove.setAttribute('aria-label',`Remove ${file.name}`);
    remove.addEventListener('click',()=>{attachments=attachments.filter(value=>value.id!==file.id);pending.delete(file.id);renderPending();changed();});
    item.append(label,remove);list.append(item);
  }
}
async function preview(file) {
  try{
    const blob=await getPrescription(file.id);
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl=URL.createObjectURL(blob);
    const image=$('prescription-image'),note=$('prescription-preview-note');
    image.onload=null;image.onerror=null;image.hidden=true;image.removeAttribute('src');note.hidden=true;
    $('prescription-title').textContent=file.name;
    $('prescription-download').href=previewUrl;$('prescription-download').download=file.name;
    $('prescription-open').href=previewUrl;$('prescription-open').hidden=false;
    if(['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)){
      image.onload=()=>{image.hidden=false;};
      image.onerror=()=>{image.hidden=true;note.textContent='This image cannot be previewed here. You can still open or download the original file.';note.hidden=false;};
      image.src=previewUrl;
    }else{note.textContent=file.type==='application/pdf'?'Open the PDF to read it, or download a copy.':'Open or download this photo to view it on your device.';note.hidden=false;}
    $('prescription-dialog').showModal();
  }catch(error){hooks.toast(error.message);}
}
export async function renderVisits() {
  const list=$('visits-list');
  try{
    const visits=await allVisits();list.replaceChildren();
    if(!visits.length){list.append(node('p','No visits saved yet. Add one above whenever you need.','small visits-empty'));return;}
    for(const visit of visits){
      const card=node('article',undefined,'visit-card'),heading=node('div',undefined,'visit-card-heading'),title=node('div');
      title.append(node('h3',visit.doctor),node('p',`${prettyDate(visit.date,true)} · ${readableTime(visit.time)}`,'small'));
      const actions=node('div',undefined,'visit-card-actions'),edit=node('button','Edit','text-button'),remove=node('button','Delete','text-button danger');
      edit.type=remove.type='button';edit.setAttribute('aria-label',`Edit visit with ${visit.doctor}`);remove.setAttribute('aria-label',`Delete visit with ${visit.doctor}`);
      edit.addEventListener('click',async()=>{
        if(saving)return;
        if(unsaved&&!await hooks.confirmAction('Discard unsaved visit changes?','Your saved visits will stay as they are. The changes in the current form will be lost.','Discard changes'))return;
        editing=visit;attachments=visit.attachments.map(file=>({...file}));pending=new Map();unsaved=false;
        $('visit-doctor').value=visit.doctor;$('visit-date').value=visit.date;$('visit-time').value=visit.time;
        $('visit-form-title').textContent='Edit doctor visit';$('save-visit').textContent='Save changes';$('visit-save-status').textContent='';$('visit-error').hidden=true;
        renderPending();$('visit-editor').open=true;$('visit-doctor').focus();
      });
      remove.addEventListener('click',async()=>{
        if(saving)return;
        if(editing?.id===visit.id && unsaved){hooks.toast('Save or cancel your changes before deleting this visit.');return;}
        if(!await hooks.confirmAction('Delete this doctor visit?',`Remove the visit with ${visit.doctor} and its ${visit.attachments.length} prescription files from this device? Download a backup first if you want to keep them.`,'Delete visit'))return;
        try{await deleteVisit(visit);if(editing?.id===visit.id)resetEditor();await renderVisits();await hooks.onChange();hooks.toast('Visit deleted.');}catch(error){hooks.toast(error.message);}
      });
      actions.append(edit,remove);heading.append(title,actions);card.append(heading);
      if(visit.attachments.length){const files=node('ul',undefined,'saved-prescriptions');for(const file of visit.attachments){const item=node('li'),button=node('button',`View ${file.name}`,'attachment-button');button.type='button';button.addEventListener('click',()=>preview(file));item.append(button,node('span',fileSize(file.size),'small'));files.append(item);}card.append(files);}
      else card.append(node('p','No prescription attached.','small'));
      list.append(card);
    }
  }catch(error){list.replaceChildren(node('p','Could not read saved visits. '+error.message,'error-banner'));}
}
export function initVisits(callbacks) {
  hooks=callbacks;resetEditor();
  $('visit-fields').disabled=true;
  for(const id of ['visit-doctor','visit-date','visit-time'])$(id).addEventListener('input',changed);
  $('prescription-files').addEventListener('change',event=>{
    const files=[...event.target.files];event.target.value='';
    if(!files.length)return;
    try{
      const added=files.map(file=>{
        const extension=file.name.split('.').pop().toLowerCase();
        const type=file.type || ({pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',heif:'image/heif'}[extension]);
        if(!prescriptionTypes.includes(type)||file.size===0||file.size>MAX_FILE_BYTES)throw new Error('Choose a photo (JPG, PNG, WebP, GIF, HEIC) or PDF, up to 10 MB each.');
        const metadata={id:crypto.randomUUID(),name:file.name,type,size:file.size};return {metadata,blob:file.slice(0,file.size,type)};
      });
      const combined=[...attachments,...added.map(file=>file.metadata)];
      if(combined.length>5)throw new Error('You can attach up to 5 prescription files per visit.');
      validateVisit({id:editing?.id||crypto.randomUUID(),doctor:'Validation',date:localDate(),time:'',attachments:combined});
      attachments=combined;for(const file of added)pending.set(file.metadata.id,file.blob);
      renderPending();changed();$('visit-error').hidden=true;
    }catch(error){showError(error.message);}
  });
  $('cancel-visit').addEventListener('click',async()=>{
    if(saving)return;
    if(unsaved&&!await hooks.confirmAction('Discard unsaved visit changes?','Your saved visits will stay as they are. The changes in this form will be lost.','Discard changes'))return;
    resetEditor();
  });
  $('visit-form').addEventListener('submit',async event=>{
    event.preventDefault();if(saving)return;
    try{
      const visit=validateVisit({id:editing?.id||crypto.randomUUID(),doctor:$('visit-doctor').value,date:$('visit-date').value,time:$('visit-time').value,attachments,updatedAt:new Date().toISOString()});
      if(visit.updatedAt===editing?.updatedAt)visit.updatedAt=new Date(Date.parse(visit.updatedAt)+1).toISOString();
      saving=true;$('visit-fields').disabled=true;$('visit-save-status').textContent='Saving visit and prescriptions…';
      await saveVisit(visit,[...pending].map(([id,blob])=>({id,blob})),editing?.updatedAt||null);
      resetEditor();await renderVisits();await hooks.onChange();hooks.toast('Visit and prescriptions saved on this device.');navigator.storage?.persist?.().catch(()=>{});
    }catch(error){showError(error.message);$('visit-save-status').textContent='Not saved';}
    finally{saving=false;$('visit-fields').disabled=false;}
  });
  $('close-prescription').addEventListener('click',()=>$('prescription-dialog').close());
  $('prescription-dialog').addEventListener('close',()=>{
    $('prescription-image').onload=null;$('prescription-image').onerror=null;
    $('prescription-image').removeAttribute('src');$('prescription-download').removeAttribute('href');$('prescription-open').removeAttribute('href');
    // Give a newly opened native PDF viewer time to retain its object URL.
    const retired=previewUrl;previewUrl=null;if(retired)setTimeout(()=>URL.revokeObjectURL(retired),60000);
  });
}
export function setVisitsReady(ready){$('visit-fields').disabled=!ready;}
