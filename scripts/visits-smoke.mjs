import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const require=createRequire(process.env.PLAYWRIGHT_MODULE_ROOT?join(process.env.PLAYWRIGHT_MODULE_ROOT,'package.json'):import.meta.url);
const {chromium}=require('playwright');
const base=process.env.TEST_URL||'http://localhost:4173';
const profile=await mkdtemp(join(tmpdir(),'diary-visits-'));
const output=new URL('../test-results/',import.meta.url);await mkdir(output,{recursive:true});
const photo=await readFile(new URL('../public/icons/icon-192.png',import.meta.url));
// A complete one-page PDF with pages, content, and an xref table.
const pdf=Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length 56 >>\nstream\nBT /F1 12 Tf 20 100 Td (Sample prescription only) Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000241 00000 n \n0000000311 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n416\n%%EOF\n");
const uploads=[{name:'prescription-photo.png',mimeType:'image/png',buffer:photo},{name:'prescription.pdf',mimeType:'application/pdf',buffer:pdf}];
let context,page;
const errors=[],requests=[];
const pass=message=>console.log('PASS '+message);
async function launch(){
  context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:390,height:844},acceptDownloads:true});
  context.on('request',request=>{if(request.url().startsWith('http')&&new URL(request.url()).origin!==new URL(base).origin)requests.push(request.url());});
  page=context.pages()[0];page.on('pageerror',error=>errors.push(error.message));
}
async function exportBackup(){
  await page.locator('#settings-button').click();const downloaded=page.waitForEvent('download');await page.locator('#export-backup').click();
  const data=JSON.parse(await readFile(await (await downloaded).path(),'utf8'));await page.locator('#close-settings').click();return data;
}
async function restoreBackup(data){
  await page.locator('#settings-button').click();
  await page.locator('#import-file').setInputFiles({name:'diary-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await page.locator('#confirm-ok').click();await page.getByText('Backup restored.',{exact:true}).waitFor();await page.locator('#close-settings').click();
}
try{
  await launch();
  // Simulate the app already containing a real version-1 diary before the upgrade.
  await page.goto(base+'/manifest.webmanifest');
  const original=await page.evaluate(async()=>{
    const now=new Date(),date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const entry={date,mood:3,notes:'Existing diary before the update.',symptoms:'',medicines:'',questions:'An existing question.',updatedAt:'2026-09-17T10:00:00.000Z'};
    await new Promise((resolve,reject)=>{const request=indexedDB.open('my-health-diary',1);request.onupgradeneeded=()=>request.result.createObjectStore('entries',{keyPath:'date'});request.onsuccess=()=>{const db=request.result,tx=db.transaction('entries','readwrite');tx.objectStore('entries').put(entry);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);});
    return entry;
  });
  await page.goto(base);await page.getByText('Ready offline',{exact:true}).waitFor();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.getByText('Saved on this device ✓',{exact:true}).waitFor();
  assert.equal(await page.locator('#notes').inputValue(),original.notes);
  assert.equal(await page.locator('#notes').isVisible(),false);
  const schema=await page.evaluate(async()=>{const {openDatabase}=await import('/db.js');const db=await openDatabase();return {version:db.version,stores:[...db.objectStoreNames]};});
  assert.equal(schema.version,2);assert.deepEqual(schema.stores,['entries','prescriptions','visits']);
  pass('Version-1 migration preserves existing diary entries and saved notes open collapsed');
  await page.locator('#notes-details summary').press('Enter');
  await page.locator('#notes').fill(original.notes+' More added later.');
  await page.locator('#save-entry').click();await page.waitForFunction(()=>!document.querySelector('#notes-details').open);
  await page.reload();await page.getByText('Saved on this device ✓',{exact:true}).waitFor();
  assert.equal(await page.locator('#notes').isVisible(),false);
  assert.equal(await page.locator('#notes').inputValue(),original.notes+' More added later.');
  await page.locator('#notes-details summary').click();await page.reload();await page.getByText('Saved on this device ✓',{exact:true}).waitFor();
  assert.equal(await page.locator('#notes').isVisible(),true);
  await page.locator('#notes-details summary').click();
  pass('Collapse persists across reload; explicit save closes notes; keyboard reopen keeps text');
  await page.getByRole('link',{name:'Doctor visit',exact:true}).click();
  await page.locator('#visit-editor summary').click();await page.locator('#save-visit').click();
  assert.equal(await page.locator('.visit-card').count(),0);
  await page.locator('#visit-doctor').fill('Dr. Test One');await page.locator('#visit-date').fill(original.date);await page.locator('#visit-time').fill('14:30');
  await page.locator('#prescription-files').setInputFiles({name:'unsafe.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
  await page.locator('#visit-error').waitFor({state:'visible'});assert.equal(await page.locator('#pending-prescriptions li').count(),0);
  await page.locator('#prescription-files').setInputFiles(uploads);
  assert.equal(await page.locator('#pending-prescriptions li').count(),2);
  await page.locator('#prescription-files').setInputFiles({name:'too-large.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(10*1024*1024+1)});
  await page.locator('#visit-error').waitFor({state:'visible'});assert.equal(await page.locator('#pending-prescriptions li').count(),2);
  await page.locator('#save-visit').click();await page.locator('.visit-card').waitFor();
  assert.ok((await page.locator('.visit-card').innerText()).includes('Dr. Test One'));
  assert.equal(await page.locator('.attachment-button').count(),2);
  pass('Doctor/date/time and photo/PDF save; empty doctor, unsupported and oversized files are rejected without losing valid attachments');
  await page.getByRole('button',{name:'View prescription-photo.png',exact:true}).click();
  await page.locator('#prescription-image').waitFor({state:'visible'});
  assert.equal(await page.locator('#prescription-image').evaluate(image=>image.naturalWidth),192);
  let downloaded=page.waitForEvent('download');await page.locator('#prescription-download').click();assert.deepEqual(await readFile(await (await downloaded).path()),photo);
  await page.locator('#close-prescription').click();
  await page.getByRole('button',{name:'View prescription.pdf',exact:true}).click();
  await page.locator('#prescription-dialog').waitFor({state:'visible'});
  assert.ok((await page.locator('#prescription-preview-note').innerText()).includes('Open the PDF'));
  downloaded=page.waitForEvent('download');await page.locator('#prescription-download').click();assert.deepEqual(await readFile(await (await downloaded).path()),pdf);
  await page.locator('#close-prescription').click();
  await page.getByRole('button',{name:'Edit visit with Dr. Test One'}).click();await page.locator('#visit-time').fill('15:45');await page.locator('#save-visit').click();
  await page.waitForFunction(()=>document.querySelector('.visit-card').innerText.includes('15:45')||document.querySelector('.visit-card').innerText.includes('3:45'));
  assert.equal(await page.locator('.attachment-button').count(),2);
  await page.locator('#visit-editor summary').click();await page.locator('#visit-doctor').fill('Dr. Test Two');await page.locator('#save-visit').click();
  await page.waitForFunction(()=>document.querySelectorAll('.visit-card').length===2);
  pass('Photo preview and exact downloads; editing retains prescriptions; multiple visits on the same day');
  await page.locator('#visit-editor summary').click();await page.locator('#visit-doctor').fill('Unsaved visit');await page.locator('#cancel-visit').click();
  await page.locator('#confirm-cancel').click();assert.equal(await page.locator('#visit-doctor').inputValue(),'Unsaved visit');
  await page.locator('#cancel-visit').click();await page.locator('#confirm-ok').click();
  await page.waitForFunction(()=>document.querySelector('#visit-doctor').value==='');
  assert.equal(await page.locator('#visit-doctor').inputValue(),'');
  const reportDownload=page.waitForEvent('download');await page.locator('#download-report').click();
  const reportText=await readFile(await (await reportDownload).path(),'utf8');
  assert.ok(reportText.includes('Dr. Test One'));assert.ok(reportText.includes('15:45'));assert.ok(reportText.includes('prescription.pdf'));
  const backup=await exportBackup();assert.equal(backup.version,2);assert.equal(backup.visits.length,2);assert.equal(backup.entries.length,1);
  const saved=backup.visits.find(visit=>visit.doctor==='Dr. Test One');
  assert.deepEqual(Buffer.from(saved.attachments[0].data,'base64'),photo);assert.deepEqual(Buffer.from(saved.attachments[1].data,'base64'),pdf);
  pass('Unsaved-edit cancellation, visit details in report, and complete backup including original prescription bytes');
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Visit overflow at ${width}`);}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:fileURLToPath(new URL('visits-mobile.png',output)),fullPage:true});
  await context.close();await launch();await context.setOffline(true);await page.goto(base+'/#doctor');
  await page.locator('.visit-card').first().waitFor();assert.equal(await page.locator('.visit-card').count(),2);
  assert.equal(await page.evaluate(()=>fetch('/network-probe',{cache:'no-store'}).then(()=>false,()=>true)),true);
  await page.getByRole('button',{name:'View prescription-photo.png',exact:true}).click();await page.locator('#prescription-image').waitFor({state:'visible'});await page.locator('#close-prescription').click();
  await page.getByRole('button',{name:'Delete visit with Dr. Test One'}).click();await page.locator('#confirm-cancel').click();assert.equal(await page.locator('.visit-card').count(),2);
  await page.getByRole('button',{name:'Delete visit with Dr. Test One'}).click();await page.locator('#confirm-ok').click();await page.waitForFunction(()=>document.querySelectorAll('.visit-card').length===1);
  await restoreBackup(backup);assert.equal(await page.locator('.visit-card').count(),2);
  await page.getByRole('button',{name:'View prescription.pdf',exact:true}).click();await page.locator('#prescription-dialog').waitFor({state:'visible'});downloaded=page.waitForEvent('download');await page.locator('#prescription-download').click();assert.deepEqual(await readFile(await (await downloaded).path()),pdf);await page.locator('#close-prescription').click();
  pass('Offline browser restart, prescription preview/download, delete confirmation, and complete restore');
  await restoreBackup({app:'my-health-diary',version:1,entries:[original]});assert.equal(await page.locator('.visit-card').count(),2);
  const malformed=structuredClone(backup);malformed.visits.find(visit=>visit.attachments.length).attachments[0].data='broken';
  await page.locator('#settings-button').click();await page.locator('#import-file').setInputFiles({name:'bad-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(malformed))});
  await page.getByText('A prescription in this backup is invalid. Nothing was restored.',{exact:true}).waitFor();await page.locator('#close-settings').click();
  assert.equal(await page.locator('.visit-card').count(),2);
  const counts=await page.evaluate(async()=>{const {openDatabase}=await import('/db.js'),db=await openDatabase();return await Promise.all(['visits','prescriptions'].map(name=>new Promise((resolve,reject)=>{const r=db.transaction(name).objectStore(name).count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);})));});
  assert.deepEqual(counts,[2,2]);
  pass('Legacy backups preserve visits; malformed attachments reject atomically; replaced and deleted files leave no orphan blobs');
  await page.getByRole('button',{name:'Edit visit with Dr. Test One'}).click();
  await page.locator('#pending-prescriptions').getByRole('button',{name:'Remove prescription-photo.png',exact:true}).click();
  await page.locator('#save-visit').click();await page.waitForFunction(()=>document.querySelectorAll('.attachment-button').length===1);
  assert.equal(await page.getByRole('button',{name:'View prescription.pdf',exact:true}).count(),1);
  const concurrency=await page.evaluate(async()=>{
    const {allVisits,saveVisit}=await import('/db.js');const visit=(await allVisits())[0];
    await saveVisit({...visit,doctor:'Newer doctor',updatedAt:'2099-01-01T00:00:00.000Z'},[],visit.updatedAt);
    try{await saveVisit({...visit,doctor:'Stale doctor'},[],visit.updatedAt);return false;}catch{return (await allVisits()).some(value=>value.doctor==='Newer doctor');}
  });
  assert.equal(concurrency,true);assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  pass('Prescription removal, stale-edit protection, no third-party requests or page errors');
  console.log('All visit and collapse checks passed.');
}finally{await context?.close();await rm(profile,{recursive:true,force:true});}
