import { ABOUT, COURSES, PROJECTS, CONTACT } from '../content';
import { getLang } from './i18n';

/** Plain, readable version for browsers without WebGL2. */
export function renderFallback() {
  const lang = getLang();
  const about = ABOUT[lang];
  const root = document.getElementById('ui')!;
  root.style.pointerEvents = 'auto';
  root.innerHTML = `
    <div style="position:absolute;inset:0;overflow:auto;background:#1a0f0a;color:#f8f1e4;font-family:Inter,system-ui,sans-serif;padding:48px 24px">
      <div style="max-width:720px;margin:0 auto">
        <h1 style="font-family:'Pixelify Sans',monospace;font-size:3rem;margin:0 0 .25rem">JOSE'S WORLD</h1>
        <p style="opacity:.75;margin:0 0 2rem">José Miguel Féliz · Computer Science · Williams College</p>
        <p style="opacity:.75">${lang === 'es' ? 'Tu navegador no soporta WebGL2, así que aquí está la versión clásica.' : 'Your browser does not support WebGL2, so here is the classic version.'}</p>
        <h2 style="font-family:'Pixelify Sans',monospace">${about.heading}</h2>
        ${about.beats.map(b => `<h3>${b.title}</h3><p>${b.text}</p>`).join('')}
        <h2 style="font-family:'Pixelify Sans',monospace">${lang === 'es' ? 'Cursos' : 'Courses'}</h2>
        ${COURSES.map(c => `<h3>${c.title[lang]} <small style="opacity:.6">${c.dept}</small></h3><ul>${c.topics[lang].map(t => `<li>${t}</li>`).join('')}</ul>`).join('')}
        <h2 style="font-family:'Pixelify Sans',monospace">${lang === 'es' ? 'Proyectos' : 'Projects'}</h2>
        ${PROJECTS.map(p => `<h3>${p.url ? `<a style="color:#ffd27a" href="${p.url}">${p.name}</a>` : p.name}</h3><p>${p.tagline[lang]} <em style="opacity:.6">${p.stack.join(' · ')}</em></p>`).join('')}
        <h2 style="font-family:'Pixelify Sans',monospace">${lang === 'es' ? 'Contacto' : 'Contact'}</h2>
        <p><a style="color:#ffd27a" href="mailto:${CONTACT.email}">${CONTACT.email}</a> · <a style="color:#ffd27a" href="${CONTACT.linkedin}">LinkedIn</a> · <a style="color:#ffd27a" href="${CONTACT.github}">GitHub</a></p>
      </div>
    </div>`;
}
