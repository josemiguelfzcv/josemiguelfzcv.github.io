import * as THREE from 'three';
import { ABOUT, COURSES, Course } from '../content';
import { getLang, onLang, applyStatic, t } from './i18n';
import { CHAPTERS, SEG } from '../director/timeline';

const HOTSPOTS = [
  { id: 'map', pos: new THREE.Vector3(71.9, 20.0, 47.5), beat: 0, at: 0.33 },
  { id: 'books', pos: new THREE.Vector3(57.1, 18.4, 47.0), beat: 1, at: 0.41 },
  { id: 'desk', pos: new THREE.Vector3(63.5, 17.4, 42.5), beat: 2, at: 0.48 },
];

/** HTML layers driven by the director: story panels, hotspots, course panel, captions, end card. */
export class Overlays {
  about = document.getElementById('panel-about')!;
  aboutHeading = document.getElementById('about-heading')!;
  aboutTitle = document.getElementById('about-title')!;
  aboutText = document.getElementById('about-text')!;
  aboutDots = document.getElementById('about-dots')!;
  course = document.getElementById('panel-course')!;
  courseDept = document.getElementById('course-dept')!;
  courseIndex = document.getElementById('course-index')!;
  courseTitle = document.getElementById('course-title')!;
  courseTopics = document.getElementById('course-topics')!;
  caption = document.getElementById('caption')!;
  endCard = document.getElementById('end-card')!;
  titleCard = document.getElementById('title-card')!;
  portalFade = document.getElementById('portal-fade')!;
  hotspotsEl = document.getElementById('hotspots')!;
  hotspotEls: HTMLElement[] = [];
  onNavigate: ((p: number) => void) | null = null;

  private beat = -1;
  private courseId = '';
  private captionKey = '';

  constructor() {
    HOTSPOTS.forEach(h => {
      const el = document.createElement('div');
      el.className = 'hotspot hidden';
      const label = document.createElement('span'); label.className = 'label'; el.appendChild(label);
      el.addEventListener('click', () => this.onNavigate?.(h.at));
      this.hotspotsEl.appendChild(el);
      this.hotspotEls.push(el);
    });
    // copy-to-clipboard for the email (mailto links do not work everywhere)
    const copyBtn = document.getElementById('copy-email');
    copyBtn?.addEventListener('click', async () => {
      const text = document.getElementById('email-text')!.textContent || '';
      const done = document.getElementById('copy-done')!;
      try { await navigator.clipboard.writeText(text); done.textContent = '✓'; }
      catch {
        const range = document.createRange(); range.selectNodeContents(document.getElementById('email-text')!);
        const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); done.textContent = '';
      }
      setTimeout(() => { done.textContent = ''; }, 1800);
    });
    const soon = document.getElementById('soon-list')!;
    const renderSoon = () => { soon.innerHTML = CHAPTERS.filter(c => !c.ready).map(c => `<span>${t(c.key)} · ${t('comingSoon')}</span>`).join(''); };
    renderSoon();
    onLang(() => { renderSoon(); this.renderBeat(true); this.renderCourse(true); this.renderHotspotLabels(); applyStatic(document.getElementById('ui')!); if (this.captionKey) this.caption.textContent = t(this.captionKey); });
    this.renderHotspotLabels();
  }

  private renderHotspotLabels() {
    const beats = ABOUT[getLang()].beats;
    this.hotspotEls.forEach((el, i) => { el.querySelector('.label')!.textContent = beats[HOTSPOTS[i].beat].title; });
  }

  /* ---------- about ---------- */
  setBeat(i: number) {
    if (i === this.beat) return;
    this.beat = i;
    this.renderBeat();
  }
  private renderBeat(force = false) {
    const i = this.beat;
    if (i < 0) { this.about.classList.add('hidden'); return; }
    const a = ABOUT[getLang()];
    const b = a.beats[Math.min(i, a.beats.length - 1)];
    this.aboutHeading.textContent = a.heading;
    this.aboutTitle.textContent = b.title;
    this.aboutText.textContent = b.text;
    this.aboutDots.innerHTML = a.beats.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    this.about.classList.remove('hidden');
    this.hotspotEls.forEach((el, k) => el.classList.toggle('on', HOTSPOTS[k].beat === i));
    void force;
  }

  /** Project 3D hotspot anchors to the screen. */
  updateHotspots(camera: THREE.Camera, visible: boolean, w: number, h: number) {
    const v = new THREE.Vector3();
    HOTSPOTS.forEach((hs, i) => {
      const el = this.hotspotEls[i];
      if (!visible) { el.classList.add('hidden'); return; }
      v.copy(hs.pos).project(camera);
      const onScreen = v.z < 1 && v.x > -0.95 && v.x < 0.95 && v.y > -0.9 && v.y < 0.9;
      el.classList.toggle('hidden', !onScreen);
      if (onScreen) { el.style.left = `${((v.x + 1) / 2) * w}px`; el.style.top = `${((1 - v.y) / 2) * h}px`; }
    });
  }

  /* ---------- courses ---------- */
  setCourse(c: Course | null, side: 1 | -1 = 1) {
    const id = c ? c.id : '';
    if (id === this.courseId) return;
    this.courseId = id;
    this.course.classList.toggle('left', side === 1);
    this.course.classList.toggle('right', side !== 1);
    this.renderCourse();
  }
  private renderCourse(force = false) {
    const c = COURSES.find(x => x.id === this.courseId);
    if (!c) { this.course.classList.add('hidden'); return; }
    const lang = getLang();
    this.courseDept.textContent = c.dept;
    this.courseDept.className = `dept-chip ${c.dept}`;
    this.courseIndex.textContent = `${COURSES.indexOf(c) + 1} / ${COURSES.length}`;
    this.courseTitle.textContent = c.title[lang];
    this.courseTopics.innerHTML = c.topics[lang].map((tp, i) => `<li style="--i:${i}">${tp}</li>`).join('');
    this.course.classList.remove('hidden');
    void force;
  }

  /* ---------- misc ---------- */
  setCaption(key: string | null) {
    if ((key ?? '') === this.captionKey) return;
    this.captionKey = key ?? '';
    if (!key) { this.caption.classList.add('hidden'); return; }
    this.caption.textContent = t(key);
    this.caption.classList.remove('hidden');
  }
  setPortalFade(a: number) { this.portalFade.style.opacity = a.toFixed(3); }
  setEnd(on: boolean) { this.endCard.classList.toggle('hidden', !on); }
  setTitleCard(on: boolean) { this.titleCard.classList.toggle('hidden', !on); }
}

export const HOTSPOT_BEATS = HOTSPOTS;
export const BEAT_RANGES: [number, number][] = [SEG.BEAT1 as any, SEG.BEAT2 as any, SEG.BEAT3 as any];
