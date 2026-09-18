import { cp, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Called only by an explicit demo build. The normal template never imports demo code.
export async function buildDemo(output) {
  const demo = new URL('../demo/', import.meta.url);
  for (const file of ['db.js','demo.js','demo.css','sample-prescription.png']) {
    if(file.endsWith('.js'))execFileSync(process.execPath,['--check',fileURLToPath(new URL(file,demo))]);
    await cp(new URL(file,demo),new URL(file,output));
  }
  const replace = (text, before, after) => {
    if(!text.includes(before))throw new Error(`Demo build needs updating: ${before.slice(0,80)}`);
    return text.replace(before,after);
  };
  let html=await readFile(new URL('index.html',output),'utf8');
  html=replace(html,'<title>My health diary</title>','<title>Health Diary — interactive demo</title>');
  html=replace(html,'<link rel="stylesheet" href="/styles.css">','<link rel="stylesheet" href="/styles.css">\n  <link rel="stylesheet" href="/demo.css">');
  html=replace(html,'<body>','<body>\n  <div class="demo-session-label">Demo only · fictional records · edits reset on refresh</div>');
  html=replace(html,'<main>','<main>\n'+await readFile(new URL('banner.html',demo),'utf8'));
  html=replace(html,'Only on this device','Demo · temporary edits');
  html=replace(html,'A little note. A clearer picture.','Interactive demo · made-up details');
  html=replace(html,'Your notes stay in this browser. Back them up from <button class="inline-button" id="backup-shortcut">Settings</button> so you don’t lose them if your phone or browser data is cleared.','This demo resets on refresh. Try a sample backup in <button class="inline-button" id="backup-shortcut">Settings</button>. Deploy your own copy to keep real notes.');
  html=replace(html,'Add photos or PDFs. Up to 5 files, 10 MB each (30 MB per visit). Saved only on this device.','Uploads are disabled in this demo. Open the fictional attachment below. Your own diary supports photos and PDFs.');
  html=replace(html,'Entries, saved visits, and prescriptions stay on this device and don’t sync. Your phone and computer have separate diaries. All saved records are included in your backup. Download one regularly and before changing phones or clearing browser data.','Try downloading a backup of the fictional samples. Demo records and drafts live only in page memory and reset on refresh; your theme preference is remembered. Real backup imports are disabled. In your own deployed diary, records persist in this browser, and backup / restore lets you move them to another device.');
  html=replace(html,'<h3>Use it like an app</h3>','<h3>Your own copy works like an app</h3>');
  html=replace(html,'<strong>iPhone:</strong> open this page in Safari','<strong>iPhone:</strong> open your own deployed diary in Safari');
  html=replace(html,'<strong>Android:</strong> open this page in Chrome','<strong>Android:</strong> open your own deployed diary in Chrome');
  html=replace(html,'Updates change the app, not your saved health records.','Demo edits reset whenever the page reloads, including after an update.');
  html=replace(html,'No account, ads, or analytics. Your entries are not sent to a server. Anyone using this unlocked browser can read them, so use your phone’s screen lock. Avoid private/incognito mode for your diary.','No account, ads, or analytics. Demo edits are not uploaded. Please use fictional details here. To keep real records, create your own diary using the link at the top.');
  await writeFile(new URL('index.html',output),html);
  let app=await readFile(new URL('app.js',output),'utf8');
  app="import './demo.js';\nimport { demoStorage } from './db.js';\n"+app.replaceAll('localStorage','demoStorage');
  app=replace(app,"const channel = 'BroadcastChannel' in window ? new BroadcastChannel('health-diary-changes') : null;",'const channel = null;');
  app=replace(app,"if (view === 'doctor') { await renderVisits(); await renderReport(); }","if (view === 'doctor') { await renderVisits(); await renderReport(); }\n  window.dispatchEvent(new CustomEvent('diary-view-ready',{detail:view}));");
  app=replace(app,"await switchView(location.hash.slice(1)||'today');","await switchView(location.hash.slice(1)||'today');\n    window.dispatchEvent(new Event('diary-ready'));");
  // Only the theme preference persists. No diary drafts or visit edits survive reload.
  app=app.replaceAll('Saved on this device ✓','Saved for this demo ✓').replaceAll("if(dirty||hasUnsavedVisit()){event.preventDefault();event.returnValue='';}",'').replaceAll('navigator.storage?.persist?.().catch(()=>{});','');
  await writeFile(new URL('app.js',output),app);
  let visits=await readFile(new URL('visits.js',output),'utf8');
  visits=visits.replaceAll('Visit and prescriptions saved on this device.','Visit saved for this demo. Resets on refresh.').replaceAll('navigator.storage?.persist?.().catch(()=>{});','');
  await writeFile(new URL('visits.js',output),visits);
  const manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',output),'utf8'));
  manifest.name='Health Diary Demo';manifest.short_name='Diary demo';
  await writeFile(new URL('manifest.webmanifest',output),JSON.stringify(manifest,null,2)+'\n');
  let sw=await readFile(new URL('sw.js',output),'utf8');
  sw=replace(sw,"const ASSETS = [","const ASSETS = ['/demo.css', '/demo.js', '/sample-prescription.png', ");
  await writeFile(new URL('sw.js',output),sw);
}
