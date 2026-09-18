import { validDate } from './model.js';
import { getPrescription } from './db.js';

export const MAX_FILE_BYTES=10*1024*1024, MAX_VISIT_BYTES=30*1024*1024, MAX_BACKUP_BYTES=150*1024*1024;
export const prescriptionTypes=['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'];
const validId=value=>typeof value==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
export function validateVisit(visit) {
  if (!visit || !validId(visit.id) || !validDate(visit.date) || typeof visit.doctor!=='string' || !visit.doctor.trim() || visit.doctor.length>200 || typeof visit.time!=='string' || visit.time!=='' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(visit.time) || !Array.isArray(visit.attachments) || visit.attachments.length>5) throw new Error('Add a doctor’s name and a valid visit date and time.');
  const ids=new Set();
  let total=0;
  for(const file of visit.attachments) {
    if (!file || !validId(file.id) || ids.has(file.id) || typeof file.name!=='string' || !file.name.trim() || file.name.length>255 || !prescriptionTypes.includes(file.type) || !Number.isSafeInteger(file.size) || file.size<=0 || file.size>MAX_FILE_BYTES) throw new Error('Choose a supported photo or PDF, up to 10 MB per file.');
    ids.add(file.id);total+=file.size;
  }
  if(total>MAX_VISIT_BYTES)throw new Error('The prescriptions for one visit must total 30 MB or less.');
  return {id:visit.id,date:visit.date,time:visit.time,doctor:visit.doctor.trim(),attachments:visit.attachments.map(file=>({id:file.id,name:file.name,type:file.type,size:file.size})),updatedAt:visit.updatedAt};
}
export function readableTime(time) {
  if(!time)return 'Time not recorded';
  return new Date(`2000-01-01T${time}:00`).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
}
export function fileSize(size) {return size<1024*1024 ? `${Math.ceil(size/1024)} KB` : `${(size/1024/1024).toFixed(1)} MB`;}
export function blobToBase64(blob) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result.split(',')[1]);
    reader.onerror=()=>reject(new Error('Could not read a prescription for the backup. Please try again.'));
    reader.readAsDataURL(blob);
  });
}
export async function exportVisits(visits) {
  const total=visits.reduce((sum,visit)=>sum+visit.attachments.reduce((bytes,file)=>bytes+file.size,0),0);
  if(total*4/3>MAX_BACKUP_BYTES-5*1024*1024)throw new Error('The prescriptions are too large for one backup. Download older prescriptions separately and remove them from the diary before backing up.');
  const result=[];
  for(const visit of visits) {
    const attachments=[];
    for(const file of visit.attachments)attachments.push({...file,data:await blobToBase64(await getPrescription(file.id))});
    result.push({...visit,attachments});
  }
  return result;
}
export function parseVisitBackup(value) {
  // Original backups contain diary entries only. They must not erase newer visit records.
  if(value.version===1)return {visits:[],files:[]};
  if(!Array.isArray(value.visits)||value.visits.length>40000)throw new Error('This backup has invalid visit records. Nothing was restored.');
  const visits=[], files=[],visitIds=new Set(),fileIds=new Set();
  for(const source of value.visits) {
    const visit=validateVisit(source);
    if(visitIds.has(visit.id))throw new Error('This backup contains duplicate visits. Nothing was restored.');
    visitIds.add(visit.id);
    for(const file of source.attachments) {
      if(fileIds.has(file.id)||typeof file.data!=='string'||file.data.length!==4*Math.ceil(file.size/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data))throw new Error('A prescription in this backup is invalid. Nothing was restored.');
      const decoded=atob(file.data);
      if(decoded.length!==file.size)throw new Error('A prescription in this backup is incomplete. Nothing was restored.');
      fileIds.add(file.id);
      // Use fresh storage IDs so imported files cannot overwrite another visit's attachments.
      const restoredId=crypto.randomUUID();
      visit.attachments.find(metadata=>metadata.id===file.id).id=restoredId;
      files.push({id:restoredId,blob:new Blob([Uint8Array.from(decoded,char=>char.charCodeAt(0))],{type:file.type})});
    }
    visits.push({...visit,updatedAt:new Date().toISOString()});
  }
  return {visits,files};
}
