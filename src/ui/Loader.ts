import { t, setLang, getLang, applyStatic } from './i18n';
import { audio } from './Audio';

/** Loading screen: progress bar with "generating…" messages, then a Click-to-enter button. */
export class Loader {
  el = document.getElementById('loader')!;
  fill = this.el.querySelector<HTMLElement>('.loader-fill')!;
  msg = document.getElementById('loader-msg')!;
  enterBtn = document.getElementById('enter-btn') as HTMLButtonElement;
  soundCheck = document.getElementById('sound-check') as HTMLInputElement;
  private resolveEnter!: (withSound: boolean) => void;
  entered = new Promise<boolean>(res => { this.resolveEnter = res; });

  constructor() {
    this.el.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === getLang());
      b.addEventListener('click', () => {
        setLang(b.dataset.lang as 'en' | 'es');
        this.el.querySelectorAll('.lang-btn').forEach(x => x.classList.toggle('active', x === b));
      });
    });
    this.enterBtn.addEventListener('click', () => {
      audio.init();
      const withSound = this.soundCheck.checked;
      audio.setEnabled(withSound);
      this.resolveEnter(withSound);
    });
    applyStatic(this.el);
  }

  set(progress: number, msgKey?: string) {
    this.fill.style.width = `${Math.round(progress * 100)}%`;
    if (msgKey) this.msg.textContent = t(msgKey);
  }

  ready() {
    this.fill.style.width = '100%';
    this.msg.textContent = '';
    this.enterBtn.disabled = false;
    this.enterBtn.classList.add('primary');
    this.enterBtn.focus();
  }

  hide() {
    this.el.classList.add('hidden');
    setTimeout(() => { this.el.style.display = 'none'; }, 1000);
  }
}
