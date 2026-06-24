// Post-export patch for the Expo web build.
// Two jobs:
//  1. Cosmetics: a dark page background (kills the white default), and on
//     desktop a centered phone-width frame so it reads as an app.
//  2. Web push: copy the service worker + manifest + icons + bootstrap into the
//     export and wire them into index.html. This is the lock-screen-poke path;
//     the Expo export ships none of it on its own.
import { readFileSync, writeFileSync, copyFileSync, cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const webpush = join(here, '..', 'web-push');
const indexPath = join(dist, 'index.html');

// 1. copy the web-push assets into the export
copyFileSync(join(webpush, 'sw.js'), join(dist, 'sw.js'));
copyFileSync(join(webpush, 'manifest.webmanifest'), join(dist, 'manifest.webmanifest'));
copyFileSync(join(webpush, 'wabil-push.js'), join(dist, 'wabil-push.js'));
mkdirSync(join(dist, 'icons'), { recursive: true });
cpSync(join(webpush, 'icons'), join(dist, 'icons'), { recursive: true });

const head = `
    <style id="wabil-web">
      html, body { background: #07080c; }
      @media (min-width: 600px) {
        body { display: flex; align-items: center; justify-content: center; }
        #root {
          width: 420px;
          height: 92vh;
          max-height: 900px;
          flex: 0 0 auto;
          border-radius: 34px;
          overflow: hidden;
          box-shadow: 0 40px 90px -25px rgba(0,0,0,.85), 0 0 0 1px rgba(120,150,200,.08);
        }
      }
    </style>
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#07080c" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="wabil" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  </head>`;

let html = readFileSync(indexPath, 'utf8');
let changed = false;

if (!html.includes('id="wabil-web"')) {
  html = html.replace('</head>', head);
  changed = true;
}
if (!html.includes('wabil-push.js')) {
  html = html.replace('</body>', '    <script src="/wabil-push.js" defer></script>\n  </body>');
  changed = true;
}

if (changed) {
  writeFileSync(indexPath, html);
  console.log('patched dist (dark bg + phone frame + web-push: sw, manifest, icons, bootstrap)');
} else {
  console.log('already patched');
}
