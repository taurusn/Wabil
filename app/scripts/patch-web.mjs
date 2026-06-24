// Post-export patch for the Expo web build.
// Injects: a dark page background (kills the white default), and on desktop a
// centered phone-width frame so it reads as an app — full-bleed on the phone.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const indexPath = join(here, '..', 'dist', 'index.html');

const css = `
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
  </head>`;

let html = readFileSync(indexPath, 'utf8');
if (!html.includes('id="wabil-web"')) {
  html = html.replace('</head>', css);
  writeFileSync(indexPath, html);
  console.log('patched dist/index.html (dark bg + desktop phone frame)');
} else {
  console.log('already patched');
}
