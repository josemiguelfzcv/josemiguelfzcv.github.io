import { CHAPTERS } from '../director/timeline';
import { drawTileTo, TileName } from '../engine/textures';
import { t, getLang, setLang, onLang, applyStatic } from './i18n';
import { audio } from './Audio';

export class Hud {
  el = document.getElementById('hud')!;
  hotbar = document.getElementById('hotbar')!;
  xpFill = document.getElementById('xp-fill')!;
  xpLevel = document.getElementById('xp-level')!;
  chapterLabel = document.getElementById('chapter-label')!;
  scrollHint = document.getElementById('scroll-hint')!;
  langToggle = document.getElementById('lang-toggle') as HTMLButtonElement;
  soundToggle = document.getElementById('sound-toggle') as HTMLButtonElement;
  slots: HTMLElement[] = [];
  onNavigate: ((p: number) => void) | null = null;
  private soundOn = false;

  constructor() {
    CHAPTERS.forEach((ch, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot' + (ch.ready ? '' : ' locked');
      slot.setAttribute('role', 'button');
      slot.tabIndex = ch.ready ? 0 : -1;
      const c = document.createElement('canvas'); c.width = 32; c.height = 32;
      drawTileTo(c.getContext('2d')!, ch.icon as TileName, 0, 0, 32);
      slot.appendChild(c);
      const num = document.createElement('span'); num.className = 'num'; num.textContent = String(i + 1); slot.appendChild(num);
      const tip = document.createElement('span'); tip.className = 'tip'; slot.appendChild(tip);
      slot.addEventListener('click', () => { if (!ch.ready) return; audio.blip(); this.onNavigate?.(ch.at); });
      slot.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); slot.click(); } });
      this.hotbar.appendChild(slot);
      this.slots.push(slot);
    });
    this.renderText();
    onLang(() => this.renderText());

    this.langToggle.addEventListener('click', () => { setLang(getLang() === 'en' ? 'es' : 'en'); audio.blip(); });
    this.soundToggle.addEventListener('click', () => { this.setSound(!this.soundOn); });
    // number keys navigate
    window.addEventListener('keydown', (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= CHAPTERS.length && CHAPTERS[n - 1].ready && !e.metaKey && !e.ctrlKey) this.onNavigate?.(CHAPTERS[n - 1].at);
    });
  }

  renderText() {
    CHAPTERS.forEach((ch, i) => {
      const tip = this.slots[i].querySelector('.tip')!;
      tip.innerHTML = `${t(ch.key)}${ch.ready ? '' : `<small>${t('comingSoon')}</small>`}`;
    });
    this.langToggle.textContent = getLang() === 'en' ? 'ES' : 'EN';
    applyStatic(this.el);
  }

  setSound(on: boolean) {
    this.soundOn = on;
    audio.setEnabled(on);
    this.soundToggle.textContent = on ? '🔊' : '🔈';
    this.soundToggle.setAttribute('aria-pressed', String(on));
  }

  show() { this.el.classList.remove('hidden'); }

  /** progress 0..1, chapter index */
  update(p: number) {
    this.xpFill.style.width = `${(p * 100).toFixed(1)}%`;
    let active = 0;
    CHAPTERS.forEach((ch, i) => { if (ch.ready && p >= ch.at - 0.02) active = i; });
    this.slots.forEach((s, i) => s.classList.toggle('active', i === active));
    this.xpLevel.textContent = String(active + 1);
    const label = t(CHAPTERS[active].key);
    if (this.chapterLabel.textContent !== `· ${label}`) this.chapterLabel.textContent = `· ${label}`;
    this.scrollHint.classList.toggle('hidden', p > 0.12);
  }
}
