const DB_NAME = 'my-health-diary';
let connection;
export function openDatabase() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('visits')) db.createObjectStore('visits', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('prescriptions')) db.createObjectStore('prescriptions', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
    request.onerror = () => { connection = null; reject(request.error); };
    request.onblocked = () => reject(new Error('Close other diary tabs, then reload.'));
  });
  return connection;
}
export async function getEntry(date) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('entries').objectStore('entries').get(date);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
export async function allEntries() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('entries').objectStore('entries').getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.date.localeCompare(a.date)));
    request.onerror = () => reject(request.error);
  });
}
export async function putEntry(entry, expectedUpdatedAt) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    const read = store.get(entry.date);
    let conflict = false;
    read.onsuccess = () => {
      if ((read.result?.updatedAt || null) !== expectedUpdatedAt) { conflict = true; tx.abort(); return; }
      store.put(entry);
    };
    tx.oncomplete = () => resolve(entry);
    tx.onabort = tx.onerror = () => reject(new Error(conflict ? 'This day changed in another tab. Copy your current notes somewhere safe, then reload to see the latest entry.' : 'Could not save. Keep this page open and download a backup. Your device may be out of storage.'));
  });
}
export async function deleteEntry(date, expectedUpdatedAt) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    const read = store.get(date);
    let conflict = false;
    read.onsuccess = () => {
      if ((read.result?.updatedAt || null) !== expectedUpdatedAt) { conflict = true; tx.abort(); return; }
      store.delete(date);
    };
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(new Error(conflict ? 'This day changed in another tab. Reload before deleting it.' : 'Could not delete this entry. Please try again.'));
  });
}
export async function restoreEntries(entries) {
  return restoreDiary(entries, [], []);
}
export async function allVisits() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('visits').objectStore('visits').getAll();
    request.onsuccess = () => resolve(request.result.sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time)));
    request.onerror = () => reject(request.error);
  });
}
export async function getPrescription(id) {
  const db = await openDatabase();
  return new Promise((resolve,reject) => {
    const request = db.transaction('prescriptions').objectStore('prescriptions').get(id);
    request.onsuccess = () => request.result ? resolve(request.result.blob) : reject(new Error('This prescription could not be found on this device. Try restoring your backup.'));
    request.onerror = () => reject(request.error);
  });
}
export async function saveVisit(visit, files, expectedUpdatedAt) {
  const db = await openDatabase();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(['visits','prescriptions'],'readwrite');
    const visits = tx.objectStore('visits'), prescriptions = tx.objectStore('prescriptions');
    const read = visits.get(visit.id);
    let conflict = false;
    read.onsuccess = () => {
      if ((read.result?.updatedAt || null) !== expectedUpdatedAt) { conflict=true; tx.abort(); return; }
      const retained = new Set(visit.attachments.map(file=>file.id));
      for (const file of read.result?.attachments || []) if (!retained.has(file.id)) prescriptions.delete(file.id);
      for (const file of files) prescriptions.put(file);
      visits.put(visit);
    };
    tx.oncomplete = () => resolve(visit);
    tx.onabort = tx.onerror = () => reject(new Error(conflict ? 'This visit changed in another tab. Cancel editing and reopen it to see the latest version.' : 'Could not save the visit. Your device may be out of storage. Keep this form open and try a smaller attachment.'));
  });
}
export async function deleteVisit(visit) {
  const db = await openDatabase();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(['visits','prescriptions'],'readwrite');
    const visits=tx.objectStore('visits'), prescriptions=tx.objectStore('prescriptions');
    const read=visits.get(visit.id);
    let conflict=false;
    read.onsuccess=()=>{
      if ((read.result?.updatedAt || null)!==visit.updatedAt) { conflict=true;tx.abort();return; }
      for (const file of read.result.attachments) prescriptions.delete(file.id);
      visits.delete(visit.id);
    };
    tx.oncomplete=resolve;
    tx.onabort=tx.onerror=()=>reject(new Error(conflict?'This visit changed in another tab. Refresh the visit list before deleting.':'Could not delete this visit. Please try again.'));
  });
}
export async function restoreDiary(entries, visits, files) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['entries','visits','prescriptions'], 'readwrite');
    entries.forEach(entry => tx.objectStore('entries').put(entry));
    const visitStore=tx.objectStore('visits'), fileStore=tx.objectStore('prescriptions');
    for (const visit of visits) {
      const read=visitStore.get(visit.id);
      read.onsuccess=()=>{
        const retained=new Set(visit.attachments.map(file=>file.id));
        for (const file of read.result?.attachments || []) if (!retained.has(file.id)) fileStore.delete(file.id);
        visitStore.put(visit);
      };
    }
    files.forEach(file=>fileStore.put(file));
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(new Error('The backup could not be restored. No entries were changed.'));
  });
}
