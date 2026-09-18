let registration, prepareUpdate, applying = false, reloadTimer;
const watched = new WeakSet();
const $ = id => document.getElementById(id);

function message(text) {
  $('update-status').textContent = text;
  if (!$('update-banner').hidden) $('update-message').textContent = text;
}
function showWaiting() {
  if (!registration?.waiting || !navigator.serviceWorker.controller) return;
  $('update-banner').hidden = false;
  $('apply-update-settings').hidden = false;
  message('A diary update is ready. Save your work and choose Update now.');
}
function unlock() {
  applying = false;
  clearTimeout(reloadTimer);
  document.body.inert = false;
  document.body.removeAttribute('aria-busy');
}

export function watchUpdates(value) {
  registration = value;
  if (!watched.has(value)) {
    watched.add(value);
    const watchInstalling = () => {
      const worker = value.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') showWaiting();
        if (worker.state === 'redundant') message('The update could not finish. Your current diary still works; try again online.');
      });
    };
    value.addEventListener('updatefound', watchInstalling);
    watchInstalling();
  }
  showWaiting();
}

export function initUpdates({ prepare }) {
  prepareUpdate = prepare;
  $('diary-address').textContent = location.origin;
  $('check-updates').addEventListener('click', async () => {
    if (!navigator.onLine) { message('Connect to the internet to check for updates. Your saved diary still works offline.'); return; }
    const button = $('check-updates'); button.disabled = true;
    message('Checking for updates…');
    try {
      const value = registration || await navigator.serviceWorker?.getRegistration('/');
      if (!value) { message('Offline setup is still preparing. Please try again shortly.'); return; }
      watchUpdates(value);
      await value.update();
      if (value.waiting) showWaiting();
      else if (value.installing) message('Downloading the new version…');
      else message('You are using the latest available version.');
    } catch { message('Could not check for updates. Try again when your connection is available.'); }
    finally { button.disabled = false; }
  });
  const applyUpdate = async () => {
    if (applying) return;
    const worker = registration?.waiting;
    if (!worker) { $('update-banner').hidden = true; $('apply-update-settings').hidden = true; message('No update is waiting. You can check again in Settings.'); return; }
    applying = true;
    document.body.inert = true;
    document.body.setAttribute('aria-busy', 'true');
    try {
      if (!await prepareUpdate()) { unlock(); message('Save or cancel any visit changes and make sure your notes are saved, then try updating again.'); return; }
      message('Opening the new version…');
      const reply = await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => { channel.port1.close(); reject(new Error('timeout')); }, 8000);
        channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
        worker.postMessage({ type: 'APPLY_UPDATE' }, [channel.port2]);
      });
      if (!reply?.accepted) { unlock(); message('Close your other diary tabs or app windows, then choose Update now again.'); return; }
      reloadTimer = setTimeout(() => { unlock(); message('The update is ready. Close this diary window and reopen the same address to finish.'); }, 10000);
    } catch { unlock(); message('Could not apply the update yet. Close this diary window and reopen the same address. Your saved records stay in this browser.'); }
  };
  $('apply-update').addEventListener('click', applyUpdate);
  $('apply-update-settings').addEventListener('click', applyUpdate);
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    // Reload only after this page explicitly saved its work and requested an update.
    if (applying) location.reload();
  });
}
