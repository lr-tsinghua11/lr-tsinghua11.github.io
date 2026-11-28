/* One quiet entrance per reading unit. No hidden content or scroll listeners. */
(() => {
  'use strict';

  function init() {
    const root = document.querySelector('.profile-sections');
    if (!root || typeof IntersectionObserver !== 'function' || typeof Element.prototype.animate !== 'function') return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const narrow = window.matchMedia('(max-width: 760px)');
    const targets = [...root.querySelectorAll([
      '.contribution', '.profile-summary', '.benchmark-board', '.profile-section-nav',
      '.section-heading', '.section-intro', '.publication-note', '.publication',
      '.education-entry', '.honor-entry', '.citation-panel', '.biography > p',
      '.biography-section > .contact-line', '.interest', '.experience-entry',
      '.service-list > article', '.topic-grid', '.note-entry', '.profile-updated'
    ].join(','))];
    const seen = new Set();
    const running = new Map();
    let observer;
    let printing = false;
    let editing = new URLSearchParams(location.search).get('edit') === '1';
    try { editing ||= sessionStorage.getItem('review-active') === '1'; } catch (_) {}

    const blocked = () => reduced.matches || editing || printing || document.hidden;
    // Keep timeline dots and their connecting line stationary and connected.
    const parts = target => target.matches('.timeline-entry')
      ? [...target.querySelectorAll(':scope > .timeline-date, :scope > .timeline-content')]
      : [target];

    function settle(target) {
      seen.add(target);
      observer?.unobserve(target);
      running.get(target)?.forEach(animation => animation.cancel());
      running.delete(target);
      target.dataset.scrollReveal = 'complete';
    }

    function suspend() {
      observer?.disconnect();
      [...running.keys()].forEach(settle);
      root.dataset.scrollMotion = 'paused';
    }

    function enter(target, delay) {
      seen.add(target);
      observer.unobserve(target);
      target.dataset.scrollReveal = 'running';
      const compact = target.matches('.section-heading, .honor-entry, .note-entry, .publication-note, .section-intro, .profile-updated');
      const distance = narrow.matches ? (compact ? 8 : 10) : (compact ? 10 : 16);
      const duration = narrow.matches ? (compact ? 360 : 440) : (compact ? 440 : 520);
      const animations = parts(target).map(part => {
        part.classList.add('scroll-reveal-part');
        const animation = part.animate([
          { opacity: 0, transform: `translateY(${distance}px)` },
          { opacity: 1, transform: 'none' }
        ], { duration, delay, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards' });
        animation.id = 'lr-scroll-reveal';
        return animation;
      });
      running.set(target, animations);
      Promise.all(animations.map(animation => animation.finished)).then(() => {
        if (running.get(target) === animations) settle(target);
      }, () => {});
    }

    function onIntersection(entries) {
      if (blocked()) { suspend(); return; }
      const groups = new Map();
      entries.filter(entry => entry.isIntersecting && !seen.has(entry.target))
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
        .forEach(entry => {
          const target = entry.target;
          // A jump past an item or keyboard focus should reveal it immediately.
          if (entry.boundingClientRect.top < 0 || target.matches(':focus-within')) {
            settle(target);
            return;
          }
          const group = target.parentElement;
          if (!groups.has(group)) groups.set(group, []);
          groups.get(group).push(target);
        });
      groups.forEach(group => {
        const step = Math.min(narrow.matches ? 35 : 55, (narrow.matches ? 90 : 130) / Math.max(1, group.length - 1));
        group.forEach((target, index) => enter(target, index * step));
      });
    }

    function revealHash(hash = location.hash) {
      if (!hash || hash === '#') return;
      let destination;
      try { destination = document.getElementById(decodeURIComponent(hash.slice(1))); } catch (_) { return; }
      if (!destination || !root.contains(destination)) return;
      // An in-page link reveals its section without making the reader wait.
      const section = destination.closest('.profile-section, .benchmark-board') || destination;
      targets.filter(target => section.contains(target) || target.contains(destination)).forEach(settle);
    }

    function start() {
      suspend();
      if (blocked()) return;
      root.dataset.scrollMotion = 'ready';
      observer = new IntersectionObserver(onIntersection, { rootMargin: '0px 0px 24px 0px', threshold: 0 });
      revealHash();
      targets.forEach(target => {
        if (seen.has(target)) return;
        // Never fade out the first screen, restored scroll position, or content already passed.
        if (target.getBoundingClientRect().top < innerHeight + 24) settle(target);
        else {
          target.dataset.scrollReveal = 'waiting';
          observer.observe(target);
        }
      });
    }

    function revealInteraction(event) {
      targets.filter(target => target.contains(event.target)).forEach(settle);
    }
    root.addEventListener('focusin', revealInteraction);
    root.addEventListener('pointerdown', revealInteraction, { passive: true });
    document.addEventListener('click', event => {
      const link = event.target.closest?.('a[href]');
      if (!link || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.button !== 0) return;
      const url = new URL(link.href, location.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) revealHash(url.hash);
    }, true);
    document.addEventListener('lr:review-mode', event => { editing = !!event.detail?.active; start(); });
    document.addEventListener('visibilitychange', start);
    window.addEventListener('hashchange', () => revealHash());
    window.addEventListener('beforeprint', () => { printing = true; suspend(); });
    window.addEventListener('afterprint', () => { printing = false; start(); });
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', event => { if (event.persisted) start(); });
    reduced.addEventListener('change', start);
    narrow.addEventListener('change', start);
    start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
