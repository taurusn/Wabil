/* wabil web-push bootstrap (web build only).
 * Registers the service worker and drives the subscribe flow that the
 * hand-written PWA used to own. Exposes window.wabilPokes so the RN settings
 * screen can later drive it directly; until then it shows one calm pill. */
(function () {
  'use strict';

  var pushSupported =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  var swReg = null;

  function isStandalone() {
    return (
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true
    );
  }

  function urlB64ToUint8(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function register() {
    if (!('serviceWorker' in navigator)) return null;
    if (!swReg) swReg = await navigator.serviceWorker.register('/sw.js');
    return swReg;
  }

  async function currentSub() {
    var reg = await register();
    if (!reg) return null;
    return reg.pushManager.getSubscription();
  }

  async function enable() {
    var reg = await register();
    if (!reg) throw new Error('no service worker');
    var perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('permission ' + perm);
    var key = (await (await fetch('/vapidPublicKey')).json()).key;
    var sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(key),
    });
    await fetch('/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub),
    });
    return sub;
  }

  async function disable() {
    var sub = await currentSub();
    if (sub) {
      await fetch('/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(function () {});
      await sub.unsubscribe();
    }
  }

  window.wabilPokes = {
    supported: pushSupported,
    isStandalone: isStandalone,
    enable: enable,
    disable: disable,
    state: async function () {
      if (!pushSupported) return 'unsupported';
      if (Notification.permission === 'denied') return 'blocked';
      return (await currentSub()) ? 'on' : 'off';
    },
  };

  // --- one calm pill, only until this is wired into the RN settings screen ---
  function pill(text) {
    var el = document.createElement('button');
    el.id = 'wabil-pokes-pill';
    el.textContent = text;
    el.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:calc(env(safe-area-inset-bottom,0px) + 18px)',
      'transform:translateX(-50%)',
      'z-index:2147483647',
      'font:500 14px/1 -apple-system,system-ui,sans-serif',
      'letter-spacing:.02em',
      'color:#cdd6e6',
      'background:rgba(20,24,34,.92)',
      'border:1px solid rgba(120,150,200,.16)',
      'padding:11px 18px',
      'border-radius:999px',
      '-webkit-backdrop-filter:blur(8px)',
      'backdrop-filter:blur(8px)',
      'box-shadow:0 10px 30px -12px rgba(0,0,0,.8)',
      'cursor:pointer',
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  function removePill() {
    var e = document.getElementById('wabil-pokes-pill');
    if (e) e.remove();
  }

  async function boot() {
    if (!pushSupported) return;
    try { await register(); } catch (e) {}
    if (await currentSub()) return; // already on, stay silent

    if (!isStandalone()) {
      var hint = pill('add wabil to your home screen for pokes');
      hint.style.cursor = 'default';
      return;
    }

    var btn = pill('turn on pokes');
    btn.addEventListener('click', async function () {
      btn.textContent = 'enabling…';
      try {
        await enable();
        btn.textContent = 'pokes on';
        setTimeout(removePill, 1400);
      } catch (e) {
        btn.textContent =
          Notification.permission === 'denied'
            ? 'blocked — enable in settings'
            : 'could not enable, tap to retry';
      }
    });
  }

  if (document.readyState === 'loading') {
    window.addEventListener('load', function () { setTimeout(boot, 800); });
  } else {
    setTimeout(boot, 800);
  }
})();
