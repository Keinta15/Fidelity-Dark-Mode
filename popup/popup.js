/* Fidelity Dark Mode - popup. One switch, kept in chrome.storage.sync; every
   Fidelity tab listens for the change (content.js), so nothing is messaged. */
'use strict';

const sw = document.getElementById('enabled');
const host = document.getElementById('host');
let enabled = true;
let onFidelity = false;

function render() {
  sw.setAttribute('aria-checked', enabled ? 'true' : 'false');
  document.body.classList.toggle('is-off', !enabled);
  host.textContent = onFidelity
    ? (enabled ? 'On for fidelity.com' : 'Off for fidelity.com')
    : 'Open Fidelity to see it';
}

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  const tab = tabs && tabs[0];
  try { onFidelity = !!tab && /(^|\.)fidelity(rewards)?\.com$/.test(new URL(tab.url).hostname); }
  catch (e) { /* a chrome:// page, or no URL */ }
  chrome.storage.sync.get({ enabled: true }, stored => {
    enabled = stored.enabled !== false;
    render();
  });
});

sw.addEventListener('click', () => {
  enabled = !enabled;
  chrome.storage.sync.set({ enabled }, render);
});
