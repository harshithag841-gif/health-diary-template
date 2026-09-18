const $ = id => document.getElementById(id);
const steps = [
  {view:'today', target:'.writing-card', title:'1. Capture the small details', text:'Open “What happened today?” and change a sample note. In your own diary, notes autosave on your device. Save entry collapses the note so you can put it away.', prepare:() => {$('notes-details').open=true;}},
  {view:'today', target:'#extra-details', title:'2. Keep your questions close', text:'Mood, symptoms, medicines and questions are optional. Try adding a fictional question: it will also appear in the appointment report.', prepare:() => {$('extra-details').open=true;}},
  {view:'journal', target:'.search', title:'3. Find what happened last week', text:'Try searching “headache” to find a sample day. Open any entry to read it or add more. Your own diary keeps these records offline.'},
  {view:'doctor', target:'#visits-section', title:'4. Remember the visit, too', text:'Each visit has a doctor, date and time. Open the sample attachment below to see the file viewer, or edit a fictional visit. Real file uploads are disabled in this demo.'},
  {view:'doctor', target:'.report-heading', title:'5. Take a useful summary', text:'Choose a date range, then print, save a PDF or download text. The report brings notes, questions and visit details together. Original prescription files stay separate.'},
  {view:'today', target:'.demo-banner', title:'6. Make it yours', text:'Try the sun/moon button at the top for light or dark mode. “Get your own diary” deploys an empty copy on your Vercel account. GitHub’s fork link opens the source code; this demo needs no account.'}
];
let step=-1, highlighted, busy=false;
const tour=$('demo-tour');
async function navigate(view) {
  if (!$(`${view}-view`).hidden) return;
  await new Promise((resolve,reject) => {
    const timeout=setTimeout(()=>{window.removeEventListener('diary-view-ready',done);reject(new Error('Please finish saving your note, then try the tour again.'));},5000);
    function done(event) { if(event.detail!==view)return; clearTimeout(timeout);window.removeEventListener('diary-view-ready',done);resolve(); }
    window.addEventListener('diary-view-ready',done);
    location.hash=view;
  });
}
function closeHints() {
  for(const button of document.querySelectorAll('.demo-hint-button')) { button.setAttribute('aria-expanded','false');$(button.getAttribute('aria-controls')).hidden=true; }
}
function endTour() {
  highlighted?.classList.remove('demo-highlight');
  tour.hidden=true;step=-1;$('demo-start').textContent='Restart the tour';$('demo-start').focus();
}
async function showStep(index) {
  if(busy)return;
  busy=true;
  try {
    closeHints();highlighted?.classList.remove('demo-highlight');
    const next=steps[index];await navigate(next.view);next.prepare?.();
    step=index;highlighted=document.querySelector(next.target);
    highlighted.before(tour);highlighted.classList.add('demo-highlight');tour.hidden=false;
    $('demo-progress').textContent=`QUICK TOUR · ${index+1} OF ${steps.length}`;
    $('demo-step-title').textContent=next.title;$('demo-step-text').textContent=next.text;
    $('demo-back').disabled=index===0;$('demo-next').textContent=index===steps.length-1?'Finish tour':'Next';
    $('demo-step-title').focus({preventScroll:true});tour.scrollIntoView({block:'start',behavior:'instant'});
  } catch(error) { endTour();$('demo-dispatch-status').textContent=error.message; }
  finally{busy=false;}
}
function hint(target, label, text) {
  const wrapper=document.createElement('div');wrapper.className='demo-hint';
  const button=document.createElement('button');button.type='button';button.className='demo-hint-button';
  const icon=document.createElement('span');icon.textContent='?';icon.setAttribute('aria-hidden','true');
  button.append(icon,document.createTextNode(label));
  const tip=document.createElement('span');tip.className='demo-hint-text';tip.id=`demo-tip-${target.id || 'notes'}`;tip.role='tooltip';tip.hidden=true;tip.textContent=text;
  button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',tip.id);button.setAttribute('aria-describedby',tip.id);
  button.addEventListener('click',()=>{const open=tip.hidden;closeHints();tip.hidden=!open;button.setAttribute('aria-expanded',String(open));});
  wrapper.append(button,tip);target.before(wrapper);
}
$('demo-reset').addEventListener('click',()=>{
  if(!window.confirm('Reset the fictional demo? Any changes you made in this page will be discarded.'))return;
  location.hash='today';location.reload();
});
$('demo-start').addEventListener('click',()=>showStep(0));
$('demo-next').addEventListener('click',()=>step===steps.length-1?endTour():showStep(step+1));
$('demo-back').addEventListener('click',()=>showStep(step-1));
$('demo-exit').addEventListener('click',endTour);
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||document.querySelector('dialog[open]'))return;
  if(document.querySelector('.demo-hint-button[aria-expanded="true"]'))closeHints();
  else if(!tour.hidden)endTour();
});
// Free navigation leaves the guided route; it must never leave a tip in a hidden view.
window.addEventListener('hashchange',()=>{if(step>=0&&!busy)endTour();});
window.addEventListener('diary-ready',()=>{
  $('demo-start').disabled=false;
  $('notes-details').open=true;
  $('extra-details').open=false;
  $('import-backup').disabled=true;$('import-file').disabled=true;$('prescription-files').disabled=true;
  hint(document.querySelector('.writing-card'),'How notes save','Your own diary autosaves in this browser, even offline. This demo keeps edits only until refresh. Save entry collapses the note; Open lets you add more.');
  hint($('visits-list'),'About prescriptions','Open the fictional attachment to try the viewer. Your own copy accepts photos and PDFs, stored in your browser. Uploads are disabled in this demo.');
  hint($('report-content'),'What goes in the report?','Notes, symptoms, medicines, questions and visit details within your selected dates. Prescription filenames are listed; the original files are not embedded.');
  const status=document.createElement('p');status.id='demo-dispatch-status';status.role='status';status.className='small';document.querySelector('.demo-banner').append(status);
}, {once:true});
