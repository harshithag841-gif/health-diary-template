(() => {
  const key = 'health-diary-theme';
  const valid = value => value === 'light' || value === 'dark';
  let theme = 'dark';
  try {
    const saved = localStorage.getItem(key);
    if (valid(saved)) theme = saved;
  } catch { /* The switch still works when browser storage is unavailable. */ }

  function paint() {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#111c1a' : '#245b55';
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
    }
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
    });
  }

  function choose(value) {
    theme = value;
    paint();
    let remembered = true;
    try { localStorage.setItem(key, theme); } catch { remembered = false; }
    document.getElementById('theme-status').textContent = remembered
      ? `${theme === 'dark' ? 'Dark' : 'Light'} mode saved on this device.`
      : 'The theme has changed, but this browser could not remember it.';
  }

  // Apply before the stylesheet and page content load to avoid a light flash.
  paint();
  document.addEventListener('DOMContentLoaded', () => {
    paint();
    document.getElementById('theme-toggle').addEventListener('click', () => choose(theme === 'dark' ? 'light' : 'dark'));
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.addEventListener('click', () => choose(button.dataset.themeChoice));
    });
  });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    theme = valid(event.newValue) ? event.newValue : 'dark';
    paint();
    const status = document.getElementById('theme-status');
    if (status) status.textContent = 'Your choice is remembered on this device.';
  });
})();
