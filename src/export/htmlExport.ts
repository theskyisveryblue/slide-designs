import { cleanCanvasHtml } from '../render/render';
import { themeForSlide } from '../model/theme';
import type { Deck } from '../model/types';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const RUNTIME = `
(function () {
  var frames = Array.prototype.slice.call(document.querySelectorAll('.frame'));
  var notes = Array.prototype.slice.call(document.querySelectorAll('.note'));
  var counter = document.getElementById('counter');
  var progress = document.getElementById('progress');
  var notesPanel = document.getElementById('notes');
  var index = 0;
  function fit() {
    var scale = Math.min(window.innerWidth / 1280, (window.innerHeight - 64) / 720);
    for (var i = 0; i < frames.length; i++) frames[i].style.transform = 'scale(' + scale + ')';
  }
  function show(next) {
    index = Math.max(0, Math.min(frames.length - 1, next));
    for (var i = 0; i < frames.length; i++) {
      frames[i].classList.toggle('is-active', i === index);
      frames[i].setAttribute('aria-hidden', String(i !== index));
    }
    counter.textContent = (index + 1) + ' / ' + frames.length;
    progress.style.width = (((index + 1) / frames.length) * 100) + '%';
    notesPanel.textContent = notes[index] ? notes[index].textContent : 'No notes for this slide.';
    if (location.hash !== '#' + (index + 1)) history.replaceState(null, '', '#' + (index + 1));
  }
  document.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === ' ' || event.key === 'PageDown' || event.key === 'Enter') { show(index + 1); event.preventDefault(); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') { show(index - 1); event.preventDefault(); }
    else if (event.key === 'Home') { show(0); event.preventDefault(); }
    else if (event.key === 'End') { show(frames.length - 1); event.preventDefault(); }
    else if (event.key === 'n' || event.key === 'N') { notesPanel.classList.toggle('is-visible'); }
    else if (event.key === 'f' || event.key === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }
  });
  document.getElementById('prev').addEventListener('click', function () { show(index - 1); });
  document.getElementById('next').addEventListener('click', function () { show(index + 1); });
  document.getElementById('notes-toggle').addEventListener('click', function () { notesPanel.classList.toggle('is-visible'); });
  window.addEventListener('resize', fit);
  fit();
  show(parseInt((location.hash || '#1').slice(1), 10) - 1 || 0);
})();
`.trim();

export interface HtmlExportOptions {
  deck: Deck;
}

export function exportHtml({ deck }: HtmlExportOptions): Blob {
  const frames = deck.slides
    .map(
      (slide, index) =>
        `<div class="frame" role="group" aria-roledescription="slide" aria-label="Slide ${index + 1} of ${deck.slides.length}">${cleanCanvasHtml(
          slide,
          themeForSlide(slide, deck.family),
        )}</div>`,
    )
    .join('\n');
  const notes = deck.slides
    .map((slide) => `<div class="note" hidden>${escapeHtml(slide.notes || '')}</div>`)
    .join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(deck.title)}</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #14140f; color: #f2efe7; font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; }
  #viewport { position: fixed; inset: 0 0 64px 0; overflow: hidden; }
  .frame { position: absolute; top: 50%; left: 50%; width: 1280px; height: 720px; margin: -360px 0 0 -640px; transform-origin: center center; opacity: 0; pointer-events: none; box-shadow: 0 24px 60px rgba(0,0,0,.45); }
  .frame.is-active { opacity: 1; pointer-events: auto; }
  .frame:focus-visible { outline: 3px solid #d8ff3e; }
  .slide-canvas { position: relative; overflow: hidden; }
  #bar { position: fixed; left: 0; right: 0; bottom: 0; height: 64px; display: flex; gap: 12px; align-items: center; padding: 0 18px; background: #1d1d18; border-top: 1px solid #33332c; }
  button { font: inherit; color: inherit; background: #2a2a23; border: 1px solid #3d3d34; border-radius: 8px; padding: 8px 14px; cursor: pointer; }
  button:hover { background: #34342b; }
  button:focus-visible { outline: 2px solid #d8ff3e; outline-offset: 2px; }
  #counter { margin-left: auto; font-variant-numeric: tabular-nums; }
  #track { position: fixed; left: 0; right: 0; bottom: 64px; height: 3px; background: #2a2a23; }
  #progress { height: 100%; width: 0; background: #d8ff3e; }
  #notes { position: fixed; right: 18px; bottom: 78px; max-width: 380px; padding: 12px 14px; background: #1d1d18; border: 1px solid #33332c; border-radius: 10px; display: none; }
  #notes.is-visible { display: block; }
  .hint { color: #8f8f83; font-size: 13px; }
  @media print { #bar, #track, #notes { display: none; } .frame { position: static; margin: 0; opacity: 1; transform: none !important; } }
</style>
</head>
<body>
<main id="viewport" tabindex="0" aria-label="${escapeHtml(deck.title)} presentation">
${frames}
</main>
<div id="track"><div id="progress"></div></div>
<nav id="bar" aria-label="Presentation controls">
  <button id="prev" type="button" aria-label="Previous slide">Prev</button>
  <button id="next" type="button" aria-label="Next slide">Next</button>
  <button id="notes-toggle" type="button" aria-label="Toggle speaker notes">Notes</button>
  <span class="hint">Arrow keys to navigate · N notes · F fullscreen</span>
  <span id="counter" aria-live="polite">1 / ${deck.slides.length}</span>
</nav>
<aside id="notes" role="note" aria-live="polite">No notes for this slide.</aside>
${notes}
<noscript><p style="padding:20px">This offline deck needs JavaScript for keyboard navigation. Every slide is present in the document.</p></noscript>
<script>${RUNTIME}</script>
</body>
</html>
`;
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

export function exportedAssetsScan(html: string): string[] {
  const findings: string[] = [];
  if (/<script[^>]+src=/i.test(html)) findings.push('external script reference');
  if (/<link[^>]+href=/i.test(html)) findings.push('external stylesheet reference');
  if (/https?:\/\//i.test(html.replace(/https?:\/\/www\.w3\.org[^"']*/g, ''))) findings.push('absolute URL');
  return findings;
}
