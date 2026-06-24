/* wabil PWA — chat (the face) + web-push subscription (the poke channel).
 * Served same-origin as the API, so all fetches are relative paths. */

const $ = (id) => document.getElementById(id);

/* ---------- chat ---------- */
const chatEl = $('chat');
const history = []; // real conversation sent to the orchestrator (seed line stays visual-only)
let busy = false;

function bubble(cls, text) {
  const el = document.createElement('div');
  el.className = `${cls} enter`;
  if (cls === 'soft') {
    el.innerHTML = '<span class="gl">⌁</span><span></span>';
    el.querySelector('span:last-child').textContent = text;
  } else {
    el.textContent = text;
  }
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  return el;
}

function thinking() {
  const el = document.createElement('div');
  el.className = 'soft thinking enter';
  el.innerHTML = '<span class="gl">⌁</span><span>…</span>';
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  return el;
}

function sanitize(raw) {
  return String(raw)
    .replace(/<aside>[\s\S]*?<\/aside>/gi, '')
    .replace(/<\/?block>/gi, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function send(text) {
  if (busy || !text.trim()) return;
  busy = true;
  $('send').disabled = true;
  bubble('me', text);
  history.push({ role: 'user', content: text });
  const dots = thinking();
  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json().catch(() => ({}));
    dots.remove();
    if (!res.ok) throw new Error(data.error || `server ${res.status}`);
    const reply = sanitize(data.reply || '');
    history.push({ role: 'assistant', content: reply });
    bubble('soft', reply || '…');
  } catch (err) {
    dots.remove();
    bubble('soft', "can't reach the brain right now. it'll be back.");
    console.error(err);
  } finally {
    busy = false;
    $('send').disabled = false;
  }
}

$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('msg');
  const text = input.value;
  input.value = '';
  send(text);
});

/* ---------- settings overlay ---------- */
$('open-settings').addEventListener('click', () => $('settings-screen').classList.remove('hidden'));
$('close-settings').addEventListener('click', () => $('settings-screen').classList.add('hidden'));

/* ---------- web push ---------- */
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

let swReg = null;
async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  if (!swReg) swReg = await navigator.serviceWorker.register('./sw.js');
  return swReg;
}

async function refreshPokeUI() {
  const toggle = $('poke-toggle');
  const hint = $('poke-hint');
  if (!pushSupported) {
    hint.textContent = 'this browser does not support notifications.';
    toggle.disabled = true;
    return;
  }
  if (!isStandalone) {
    hint.textContent = 'open wabil from your home screen first — iOS only allows notifications for installed apps. tap share → add to home screen.';
    toggle.disabled = true;
    return;
  }
  hint.textContent = 'turn this on to let wabil poke you when something truly matters.';
  toggle.disabled = false;
  const reg = await registerSW();
  const sub = await reg.pushManager.getSubscription();
  toggle.classList.toggle('off', !sub);
}

async function enablePokes() {
  const toggle = $('poke-toggle');
  toggle.classList.add('busy');
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      $('poke-hint').textContent = 'notifications are blocked. enable them in settings → wabil.';
      return;
    }
    const reg = await registerSW();
    const keyRes = await fetch('/vapidPublicKey');
    const { key } = await keyRes.json();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    await fetch('/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub),
    });
    toggle.classList.remove('off');
    $('poke-hint').textContent = 'pokes are on. wabil will reach you when it counts.';
  } catch (err) {
    console.error(err);
    $('poke-hint').textContent = 'could not enable pokes — try again.';
  } finally {
    toggle.classList.remove('busy');
  }
}

async function disablePokes() {
  const toggle = $('poke-toggle');
  toggle.classList.add('busy');
  try {
    const reg = await registerSW();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch('/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe();
    }
    toggle.classList.add('off');
    $('poke-hint').textContent = 'pokes are off.';
  } finally {
    toggle.classList.remove('busy');
  }
}

$('poke-toggle').addEventListener('click', () => {
  if ($('poke-toggle').classList.contains('busy')) return;
  if ($('poke-toggle').classList.contains('off')) enablePokes();
  else disablePokes();
});

$('test-push').addEventListener('click', async () => {
  $('test-push').textContent = 'sending…';
  try {
    const res = await fetch('/push/test', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    $('test-push').textContent = res.ok ? `sent to ${data.sent ?? 0} device(s)` : 'failed';
  } catch {
    $('test-push').textContent = 'failed';
  }
  setTimeout(() => ($('test-push').textContent = 'send a test poke'), 2500);
});

/* ---------- boot ---------- */
registerSW().catch(() => {});
refreshPokeUI();
window.addEventListener('focus', refreshPokeUI);
