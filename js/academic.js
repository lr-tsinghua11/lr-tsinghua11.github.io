/* Persisted review layouts are ordinary source data, also used by the live site. */
/* Copy also works on the development machine's plain HTTP address. */
(() => {
  const copyText = async value => {
    if (window.isSecureContext && navigator.clipboard) {
      try { await navigator.clipboard.writeText(value); return true; } catch (_) {}
    }
    const input = document.createElement('textarea');
    input.value = value;
    input.readOnly = true;
    input.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0';
    document.body.append(input);
    input.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) {}
    input.remove();
    return copied;
  };
  document.querySelectorAll('[data-copy-contact]').forEach(button => {
    let timer;
    button.addEventListener('click', async () => {
      if (document.body.classList.contains('is-reviewing')) return;
      const group = button.closest('[data-contact-copy]');
      const value = group.querySelector('[data-copy-value]');
      const copied = await copyText(value.textContent.trim());
      button.classList.toggle('is-copied', copied);
      group.querySelector('[data-copy-status]').textContent = copied ? button.dataset.copiedLabel : button.dataset.copyFailed;
      if (!copied) {
        const range = document.createRange();
        range.selectNodeContents(value);
        const selection = window.getSelection();
        selection.removeAllRanges(); selection.addRange(range);
      }
      button.focus({preventScroll:true});
      clearTimeout(timer);
      timer = setTimeout(() => {button.classList.remove('is-copied');group.querySelector('[data-copy-status]').textContent='';}, 2500);
    });
  });
  document.querySelectorAll('[data-contact-peek]').forEach(group => {
    const reveal = () => group.classList.remove('is-contact-dismissed');
    group.addEventListener('pointerenter', reveal);
    group.addEventListener('focusin', event => {
      if (!group.contains(event.relatedTarget)) reveal();
    });
    group.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || document.body.classList.contains('is-reviewing')) return;
      group.classList.add('is-contact-dismissed');
    });
  });

  const wechatCards = Array.from(document.querySelectorAll('[data-wechat-contact]')).map(group => {
    const trigger = group.querySelector('summary');
    const card = group.querySelector('.profile-wechat-card');
    let pinned = false, closeTimer;
    const fit = () => {
      if (!group.open) return;
      card.style.setProperty('--wechat-shift-x', '0px');
      card.style.setProperty('--wechat-shift-y', '0px');
      const rect = card.getBoundingClientRect(), gap = 12;
      const x = Math.max(gap - rect.left, Math.min(0, window.innerWidth - gap - rect.right));
      const y = Math.max(gap - rect.top, Math.min(0, window.innerHeight - gap - rect.bottom));
      card.style.setProperty('--wechat-shift-x', x + 'px');
      card.style.setProperty('--wechat-shift-y', y + 'px');
    };
    const close = (restoreFocus = false) => {
      clearTimeout(closeTimer);
      pinned = false;
      group.open = false;
      if (restoreFocus) trigger.focus({preventScroll:true});
    };
    const open = () => {
      clearTimeout(closeTimer);
      wechatCards.forEach(other => { if (other.group !== group) other.close(); });
      group.open = true;
      fit();
    };
    trigger.addEventListener('click', event => {
      event.preventDefault();
      if (event.target.closest('[contenteditable="true"],[contenteditable="plaintext-only"]')) return;
      if (pinned) close();
      else { pinned = true; open(); }
    });
    group.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') open();
    });
    group.addEventListener('pointerleave', () => {
      closeTimer = setTimeout(() => {
        if (!pinned && !group.contains(document.activeElement)) close();
      }, 180);
    });
    group.addEventListener('focusout', event => {
      if (!pinned && !group.contains(event.relatedTarget)) close();
    });
    group.addEventListener('toggle', () => {
      if (group.open) fit();
      else pinned = false;
    });
    group.querySelector('[data-close-wechat]').addEventListener('click', () => close(true));
    return {group, close, fit};
  });
  document.addEventListener('pointerdown', event => {
    wechatCards.forEach(item => {
      if (!item.group.contains(event.target)) item.close();
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    wechatCards.forEach(item => {
      if (item.group.open) item.close(item.group.contains(document.activeElement));
    });
  });
  window.addEventListener('resize', () => wechatCards.forEach(item => item.fit()));
})();

(() => {
  'use strict';
  const initial = JSON.parse(document.getElementById('profile-layout')?.textContent || '{}');
  const allBlocks = () => Array.from(document.querySelectorAll('[data-review-group] > [data-review-block]'));
  const keyOf = block => block.parentElement.dataset.reviewGroup + '.' + block.dataset.reviewBlock;
  const defaults = Object.fromEntries(Array.from(document.querySelectorAll('[data-review-group]')).map(group => [group.dataset.reviewGroup, Array.from(group.children).filter(node=>node.hasAttribute('data-review-block')).map(node=>node.dataset.reviewBlock)]));
  const apply = layout => {
    document.querySelectorAll('[data-review-group]').forEach(group => {
      const order = layout.groups?.[group.dataset.reviewGroup] || defaults[group.dataset.reviewGroup];
      if (!Array.isArray(order)) return;
      const blocks = Array.from(group.children).filter(node=>node.hasAttribute('data-review-block'));
      const anchor = document.createComment('review order');
      if (!blocks.length) return;
      group.insertBefore(anchor,blocks[0]);
      const rank = node => {const index=order.indexOf(node.dataset.reviewBlock);return index<0?999:index;};
      blocks.sort((a,b)=>rank(a)-rank(b)).forEach(block=>group.insertBefore(block,anchor));
      anchor.remove();
    });
    allBlocks().forEach(block => {
      const style=layout.styles?.[keyOf(block)] || {};
      if(style.scale)block.style.setProperty('--type-scale',style.scale);
      else block.style.removeProperty('--type-scale');
      block.style.maxWidth=style.width && style.width!==100 ? style.width+'%' : '';
      block.style.marginInline=style.width && style.width!==100 ? 'auto' : '';
      block.style.marginTop=style.space == null ? '' : style.space+'px';
      if(style.figure)block.style.setProperty('--figure-width',style.figure+'px');
      else block.style.removeProperty('--figure-width');
    });
  };
  window.LRLayout={initial,apply,keyOf,allBlocks};
  apply(initial);
})();

(() => {
  const filters=document.querySelector('[data-notes-filters]');
  if(filters) {
    const sections=Array.from(document.querySelectorAll('[data-notes-topic]'));
    const update=()=>{
      const raw=location.hash.slice(1);
      const key=sections.some(s=>s.dataset.notesTopic===raw) ? raw : 'all';
      sections.forEach(s=>s.hidden=key!=='all'&&key!==s.dataset.notesTopic);
      filters.querySelectorAll('[data-filter]').forEach(a=>a.setAttribute('aria-current',String(a.dataset.filter===key)));
    };
    window.addEventListener('hashchange',update);update();
  }
  const stats=document.querySelector('[data-site-statistics]');
  if(stats) {
    const preview=['localhost','127.0.0.1','[::1]'].includes(location.hostname) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
    if(preview) {
      stats.querySelector('[data-preview-statistics]').hidden=false;
      const views=document.querySelector('.reading-views');
      if(views) views.title=document.documentElement.lang.startsWith('en') ? 'Local previews do not count toward article views.' : '本地预览不计入正式站阅读次数。';
    }
    else {
      const loadStatistics=()=>{
        const script=document.createElement('script');script.src=stats.dataset.statisticsSrc.replace(/([^:])\/{2,}/g,'$1/');script.async=true;document.body.append(script);
      };
      if(document.readyState==='complete')loadStatistics();
      else window.addEventListener('load',loadStatistics,{once:true});
    }
  }
})();

/* Rolling benchmark digits, followed by one short highlight, once per visible panel. */
(() => {
  'use strict';
  const nodes = [...document.querySelectorAll('[data-benchmark-count]')];
  if (!nodes.length || typeof IntersectionObserver !== 'function' || typeof requestAnimationFrame !== 'function') return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let editing = new URLSearchParams(location.search).get('edit') === '1' || document.body.classList.contains('is-reviewing');
  try { editing ||= sessionStorage.getItem('review-active') === '1'; } catch (_) {}
  if (reduced.matches || editing) return;

  const counters = new Map();
  nodes.forEach(node => {
    const target = Number(node.dataset.benchmarkCount);
    const value = node.querySelector('.benchmark-count-value');
    if (!value || !Number.isFinite(target) || target < 0 || target > 100) return;
    counters.set(node, {node, value, target, units:Math.round(target * 10), done:false,
      start:null, previous:null, delay:0, reels:null, wheels:[], settleAt:null, landedAt:null});
  });
  if (!counters.size) return;
  const running = new Set();
  const duration = 1800;
  const shineDuration = 520;
  let frame = 0;

  function prepareReels(counter) {
    const reels = document.createElement('span');
    reels.className = 'benchmark-reels';
    const text = counter.target.toFixed(1);
    const digitCount = text.replace('.', '').length;
    let index = 0;
    for (const character of text) {
      if (character === '.') {
        const point = document.createElement('span');
        point.className = 'benchmark-reel-point';
        point.textContent = '.';
        reels.append(point);
        continue;
      }
      const digit = document.createElement('span');
      digit.className = 'benchmark-digit';
      const strip = document.createElement('span');
      strip.className = 'benchmark-digit-strip';
      // The repeated zero makes the wrap from nine to zero seamless.
      for (let value = 0; value <= 10; value++) {
        const cell = document.createElement('span');
        cell.textContent = String(value % 10);
        strip.append(cell);
      }
      const leading = index < digitCount - 2;
      if (leading) digit.style.opacity = '0';
      digit.append(strip);
      reels.append(digit);
      counter.wheels.push({digit, strip, leading, divisor:10 ** (digitCount - index - 1),
        position:0, from:0, settleDuration:210 + index * 80, response:65 + index * 15});
      index++;
    }
    counter.reels = reels;
    counter.node.append(reels);
  }

  function drawWheel(wheel, position, delta) {
    const speed = Math.abs(position - wheel.position) / Math.max(1, delta);
    wheel.position = position;
    wheel.strip.style.transform = `translate3d(0, -${(position % 10).toFixed(5)}em, 0)`;
    wheel.strip.style.setProperty('--reel-blur', Math.min(.7, speed * 2.2).toFixed(3) + 'px');
    if (wheel.leading) wheel.digit.style.opacity = String(Math.min(1, position * 3));
  }

  function aura(counter, opacity, scale) {
    counter.node.style.setProperty('--count-aura', opacity.toFixed(3));
    counter.node.style.setProperty('--count-aura-scale', scale.toFixed(3));
  }

  function finish(counter) {
    counter.value.textContent = counter.target.toFixed(1);
    counter.reels?.remove();
    counter.reels = null;
    counter.wheels = [];
    ['--count-aura', '--count-aura-scale', '--count-shine-x', '--count-land-scale', '--count-land-glow']
      .forEach(property => counter.node.style.removeProperty(property));
    counter.node.dataset.countState = 'complete';
    counter.done = true;
    running.delete(counter);
    observer.unobserve(counter.node);
  }

  function settleAll() {
    cancelAnimationFrame(frame);
    frame = 0;
    observer.disconnect();
    counters.forEach(finish);
  }

  function tick(now) {
    frame = 0;
    running.forEach(counter => {
      // Start on a rendered frame so a busy initial paint cannot skip the count-in.
      if (counter.start === null) {
        counter.start = now + counter.delay;
        counter.previous = now;
      }
      const delta = Math.max(0, now - counter.previous);
      counter.previous = now;
      if (now < counter.start) return;
      if (counter.landedAt !== null) {
        const progress = Math.min(1, (now - counter.landedAt) / shineDuration);
        const pulse = Math.sin(Math.PI * progress);
        counter.node.style.setProperty('--count-shine-x', ((1 - progress) * 100).toFixed(2) + '%');
        counter.node.style.setProperty('--count-land-scale', (1 + .04 * pulse).toFixed(4));
        counter.node.style.setProperty('--count-land-glow', (.16 * pulse).toFixed(3) + 'em');
        aura(counter, .65 * (1 - progress), 1 + .25 * progress);
        if (progress === 1) finish(counter);
        return;
      }
      if (counter.settleAt !== null) {
        let settled = true;
        counter.wheels.forEach(wheel => {
          const progress = Math.min(1, (now - counter.settleAt) / wheel.settleDuration);
          const target = Math.floor(counter.units / wheel.divisor);
          drawWheel(wheel, wheel.from + (target - wheel.from) * (1 - (1 - progress) ** 3), delta);
          if (progress < 1) settled = false;
        });
        if (settled) {
          counter.landedAt = now;
          counter.reels.remove();
          counter.reels = null;
          counter.wheels = [];
          counter.node.dataset.countState = 'landed';
        }
        return;
      }
      if (counter.node.dataset.countState !== 'running') counter.node.dataset.countState = 'running';
      const progress = Math.min(1, (now - counter.start) / duration);
      const eased = progress ** 3 * (progress * (progress * 6 - 15) + 10);
      const units = Math.round(counter.units * eased);
      const text = (units / 10).toFixed(1);
      if (counter.value.textContent !== text) counter.value.textContent = text;
      counter.wheels.forEach(wheel => {
        const target = Math.floor(units / wheel.divisor);
        drawWheel(wheel, wheel.position + (target - wheel.position) * (1 - Math.exp(-delta / wheel.response)), delta);
      });
      aura(counter, .2 + .45 * Math.sin(Math.PI * progress), .8 + .2 * eased);
      if (progress === 1) {
        counter.settleAt = now;
        counter.wheels.forEach(wheel => { wheel.from = wheel.position; });
        counter.node.dataset.countState = 'settling';
      }
    });
    if (running.size) frame = requestAnimationFrame(tick);
  }

  const observer = new IntersectionObserver(entries => {
    if (reduced.matches || editing) { settleAll(); return; }
    if (document.hidden) return;
    entries.filter(entry => entry.isIntersecting && entry.intersectionRatio >= .65)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
      .forEach((entry, index) => {
        const counter = counters.get(entry.target);
        if (!counter || counter.done || running.has(counter)) return;
        counter.delay = 100 + index * 140;
        prepareReels(counter);
        counter.node.dataset.countState = 'queued';
        running.add(counter);
        observer.unobserve(counter.node);
      });
    if (running.size && !frame) frame = requestAnimationFrame(tick);
  }, {threshold:.65, rootMargin:'0px 0px -24px 0px'});

  function observeWaiting() {
    observer.disconnect();
    if (reduced.matches || editing) { settleAll(); return; }
    if (document.hidden) return;
    counters.forEach(counter => {
      if (!counter.done && !running.has(counter)) observer.observe(counter.node);
    });
  }

  function suspend() {
    cancelAnimationFrame(frame);
    frame = 0;
    observer.disconnect();
    running.forEach(finish);
  }

  counters.forEach(counter => {
    counter.value.textContent = '0.0';
    counter.node.dataset.countState = 'waiting';
  });
  observeWaiting();
  reduced.addEventListener('change', () => { if (reduced.matches) settleAll(); });
  document.addEventListener('lr:review-mode', event => {
    editing = !!event.detail?.active;
    if (editing) settleAll();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend(); else observeWaiting();
  });
  window.addEventListener('beforeprint', settleAll);
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', event => { if (event.persisted) observeWaiting(); });
})();

/* Center arrows between the contained images, including their unequal side gaps. */
(() => {
  document.querySelectorAll('.benchmark-panels').forEach(row => {
    const steps = [...row.querySelectorAll('.benchmark-step')];
    const images = [...row.querySelectorAll('.benchmark-figure img')];
    const imageEdges = image => {
      if (!image) return null;
      const box = image.getBoundingClientRect();
      const width = image.naturalWidth || Number(image.getAttribute('width'));
      const height = image.naturalHeight || Number(image.getAttribute('height'));
      if (!width || !height || !box.width || !box.height) return null;
      const renderedWidth = Math.min(box.width, box.height * width / height);
      const left = box.left + (box.width - renderedWidth) / 2;
      return {left, right: left + renderedWidth};
    };
    const align = () => {
      steps.forEach(step => {
        const left = imageEdges(step.previousElementSibling?.querySelector('.benchmark-figure img'));
        const right = imageEdges(step.nextElementSibling?.querySelector('.benchmark-figure img'));
        if (!left || !right) return;
        const box = step.getBoundingClientRect();
        const offset = (left.right + right.left) / 2 - (box.left + box.width / 2);
        step.style.setProperty('--benchmark-step-offset', offset.toFixed(2) + 'px');
      });
    };
    let frame = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; align(); });
    };
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(schedule);
      observer.observe(row);
      images.forEach(image => observer.observe(image));
    } else window.addEventListener('resize', schedule);
    images.forEach(image => image.addEventListener('load', schedule));
    document.fonts?.ready.then(schedule);
    align();
  });
})();

/* Recompute chart geometry at its rendered width so labels never shrink on phones. */
(() => {
  'use strict';
  const ns = 'http://www.w3.org/2000/svg';
  const en = document.documentElement.lang.startsWith('en');
  const make = (name, attributes, text) => {
    const node = document.createElementNS(ns, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (text != null) node.textContent = text;
    return node;
  };

  document.querySelectorAll('[data-citation-chart]').forEach(figure => {
    const hindex=figure.dataset.citationMetric==='hindex';
    const section=figure.closest('.citations-section');
    const basis=section.dataset.citationBasis || 'scholar';
    const panel=figure.closest('.citation-panel');
    const honors=section.parentElement.matches('.profile-sections') ? section.parentElement.querySelector('.honors-list') : null;
    const honorEntries=honors ? [...honors.querySelectorAll('.honor-entry')] : [];
    const chartFigures=[...panel.querySelectorAll('[data-citation-chart]')];
    const pairedLayout=window.matchMedia('(min-width:1000px)');
    const scaleStep=hindex ? 4 : 1000;
    const svg = figure.querySelector('.citation-svg');
    const surface = figure.querySelector('[data-citation-surface]');
    const cursor = figure.querySelector('[data-citation-cursor]');
    const output = figure.querySelector('[data-citation-value]');
    let data = JSON.parse(figure.querySelector('[data-citation-data]').textContent);
    if (!data.length || !svg || !surface || !cursor || !output) return;
    let times = data.map(point => Date.parse(point.date + 'T00:00:00Z'));
    let start=Date.parse(section.dataset.citationStart+'T00:00:00Z');
    let end=Date.parse(section.dataset.citationEnd+'T00:00:00Z'),span=Math.max(1,end-start);
    let max = Math.max(scaleStep, Math.ceil(Math.max(...data.map(point => point.value)) / scaleStep) * scaleStep);
    let latest = data.at(-1);
    let points = [], index = data.length - 1, active = false, lastWidth = 0, lastHeight = 0, frame = null;
    const trace = svg.querySelector('[data-citation-trace]');
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let revealAnimation = null, hasRevealed = false, inView = false, readyToReveal = false;
    const canAnimate = () => !motionPreference.matches && typeof trace?.animate === 'function';
    const finishReveal = () => {
      revealAnimation?.cancel();
      revealAnimation = null;
      hasRevealed = true;
      figure.classList.add('has-revealed');
      figure.classList.remove('is-drawing');
    };
    const playReveal = () => {
      if (!canAnimate() || document.body.classList.contains('is-reviewing')) { finishReveal(); return; }
      reset();
      revealAnimation?.cancel();
      hasRevealed = true;
      figure.classList.add('has-revealed', 'is-drawing');
      const speed=parseFloat(getComputedStyle(figure).getPropertyValue('--citation-motion-speed')) || 1;
      revealAnimation = trace.animate([
        {clipPath: 'inset(0 100% 0 0)'},
        {clipPath: 'inset(-4px -4px -4px -4px)'}
      ], {duration: 1800/speed, easing: 'cubic-bezier(.35,.05,.25,1)'});
      revealAnimation.onfinish = () => {
        revealAnimation = null;
        figure.classList.remove('is-drawing');
      };
    };
    const syncVisibility = () => {
      const visible = inView && !document.hidden;
      figure.classList.toggle('is-in-view', visible);
      if (revealAnimation) visible ? revealAnimation.play() : revealAnimation.pause();
      if (visible && readyToReveal && !hasRevealed) playReveal();
    };
    const syncMotion = () => {
      const enabled = canAnimate();
      figure.classList.toggle('citation-motion-ready', enabled);
      if (!enabled || document.body.classList.contains('is-reviewing')) finishReveal();
      else syncVisibility();
    };

    const describe = point => window.LRCitationCurve.readout(point,hindex ? 'hindex' : 'citations',en);
    const paintSelection = () => {
      const point = points[index];
      if (!point) return;
      cursor.removeAttribute('hidden');
      cursor.querySelector('line').setAttribute('x1', point.x);
      cursor.querySelector('line').setAttribute('x2', point.x);
      cursor.querySelector('circle').setAttribute('cx', point.x);
      cursor.querySelector('circle').setAttribute('cy', point.y);
      output.textContent = describe(point);
      output.hidden = false;
      figure.classList.add('is-inspecting');
      // Anchor the readout to the selected point without moving the axes or panel.
      const chartBox = svg.getBoundingClientRect(), figureBox = figure.getBoundingClientRect();
      const scale = chartBox.width / svg.viewBox.baseVal.width;
      const px = chartBox.left - figureBox.left + point.x * scale;
      const py = chartBox.top - figureBox.top + point.y * scale;
      output.style.left = Math.max(6, Math.min(figure.clientWidth - output.offsetWidth - 6, px - output.offsetWidth / 2)) + 'px';
      output.style.top = Math.max(chartBox.top - figureBox.top + 4, py - output.offsetHeight - 14) + 'px';
      surface.setAttribute('aria-valuenow', index);
      surface.setAttribute('aria-valuetext', output.textContent);
    };
    const show = value => {
      // Interaction always exposes the complete curve immediately.
      if (!hasRevealed || revealAnimation) finishReveal();
      index = Math.max(0, Math.min(data.length - 1, value));
      active = true;
      paintSelection();
    };
    const reset = () => {
      active = false;
      index = data.length - 1;
      cursor.setAttribute('hidden', '');
      output.hidden = true;
      figure.classList.remove('is-inspecting');
      surface.setAttribute('aria-valuenow', index);
      surface.setAttribute('aria-valuetext', describe(latest));
    };

    const left = 64, right = 20, top = 32, bottom = 36;
    const chartHeight = width => {
      if (!pairedLayout.matches || !honorEntries.length) {
        return Math.round(Math.min(240,Math.max(200,width*.43)));
      }
      const verticalFrame = element => {
        const style=getComputedStyle(element);
        return ['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((sum,key)=>sum+parseFloat(style[key]),0);
      };
      // Use the list's content, not its stretched card height, to avoid a sizing loop.
      const honorHeight=honorEntries.at(-1).getBoundingClientRect().bottom-honorEntries[0].getBoundingClientRect().top+verticalFrame(honors);
      const nonPlotHeight=verticalFrame(panel)+parseFloat(getComputedStyle(panel).rowGap)*(chartFigures.length+1)
        +panel.querySelector('.citation-metadata').getBoundingClientRect().height
        +panel.querySelector('.citation-shared-caption').getBoundingClientRect().height
        +chartFigures.reduce((sum,chart)=>sum+chart.getBoundingClientRect().height-chart.querySelector('svg').getBoundingClientRect().height,0);
      // Equal plots share the remaining space, with room for all six citation ticks.
      return Math.max(190,Math.floor((honorHeight-nonPlotHeight)/chartFigures.length));
    };
    const render = (force=false) => {
      frame = null;
      const width = +svg.getBoundingClientRect().width.toFixed(2);
      if (width < 100) return;
      const height=chartHeight(width);
      if (!force && Math.abs(width - lastWidth) < .05 && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      // Both plots use the same recorded date range and horizontal scale.
      const base = height - bottom;
      const plotWidth = width - left - right;
      const x = time => +(left + (time - start) / span * plotWidth).toFixed(2);
      const y = value => +(base - value / max * (base - top)).toFixed(2);
      points = data.map((point, i) => ({...point, x: x(times[i]), y: y(point.value)}));
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.style.height = height + 'px';
      figure.style.setProperty('--citation-left', left + 'px');
      figure.style.setProperty('--citation-right', right + 'px');
      // Share the full plot's color scale across both metrics.
      const lineGradient=svg.querySelector('[data-citation-line-gradient]');
      lineGradient.setAttribute('x1',left);
      lineGradient.setAttribute('x2',width-right);
      const washGradient=svg.querySelector('[data-citation-wash-gradient]');
      washGradient.setAttribute('y1',top);
      washGradient.setAttribute('y2',base);

      const grid = [], yaxis = [], xaxis = [make('line', {class: 'citation-axis-line', x1: left, x2: width - right, y1: base, y2: base})];
      for (let value = 0; value <= max; value += hindex ? max/2 : 1000) {
        grid.push(make('line', {class: 'citation-gridline', x1: left, x2: width - right, y1: y(value), y2: y(value)}));
        yaxis.push(make('text', {class: 'citation-axis', x: left - 10, y: y(value) + 6, 'text-anchor': 'end'}, hindex ? String(value) : value ? (value / 1000) + 'k' : '0'));
      }
      for (const tick of window.LRCitationCurve.timeTicks(start,end,plotWidth)) {
        xaxis.push(make('line', {class: 'citation-axis-tick', x1: x(tick.time), x2: x(tick.time), y1: base, y2: base + 5}));
        xaxis.push(make('text', {class: 'citation-axis', x: x(tick.time)+(tick.offset || 0), y: height - 9, 'text-anchor': tick.anchor || 'middle'}, tick.label));
      }
      svg.querySelector('[data-citation-grid]').replaceChildren(...grid);
      svg.querySelector('[data-citation-yaxis]').replaceChildren(...yaxis);
      svg.querySelector('[data-citation-xaxis]').replaceChildren(...xaxis);

      const last = points.at(-1);
      const line=hindex || basis==='publication' ? window.LRCitationCurve.steps(points) : window.LRCitationCurve.paths(points).line;
      svg.querySelector('.citation-area').setAttribute('d',line+` L${last.x},${base} L${points[0].x},${base} Z`);
      svg.querySelector('.citation-series').setAttribute('d',line);
      svg.querySelector('[data-citation-dots]').replaceChildren(...[last].flatMap(point => {
        const halo = make('circle', {class: 'citation-dot-halo', cx: point.x, cy: point.y, r: 10, 'aria-hidden': 'true'});
        const ring = make('circle', {class: 'citation-dot-ring', cx: point.x, cy: point.y, r: 10, 'aria-hidden': 'true'});
        const dot = make('circle', {class: 'citation-dot citation-dot-latest', cx: point.x, cy: point.y, r: 7.5});
        dot.append(make('title', {}, point.date + ' · ' + point.value.toLocaleString('en-US')));
        return [halo, ring, dot];
      }));
      const label = svg.querySelector('[data-citation-latest]');
      label.textContent=latest.value.toLocaleString('en-US');
      label.setAttribute('x', last.x - 14);
      label.setAttribute('y', top);
      cursor.querySelector('line').setAttribute('y1', top);
      cursor.querySelector('line').setAttribute('y2', base);
      surface.setAttribute('x', left);
      surface.setAttribute('y', 0);
      surface.setAttribute('width', plotWidth);
      surface.setAttribute('height', base);
      if (active) paintSelection();
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(() => render());
    };
    const inspect = event => {
      if (!points.length) return;
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      let low = 0, high = points.length - 1;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (points[mid].x < position.x) low = mid + 1;
        else high = mid;
      }
      show(hindex ? (low>0 && points[low].x>position.x ? low-1 : low)
        : low>0 && Math.abs(points[low-1].x-position.x)<Math.abs(points[low].x-position.x) ? low-1 : low);
    };
    surface.addEventListener('pointermove', inspect);
    surface.addEventListener('pointerdown', inspect);
    surface.addEventListener('click', () => surface.focus({preventScroll: true}));
    surface.addEventListener('pointerleave', () => { if (document.activeElement !== surface) reset(); });
    surface.addEventListener('focus', () => show(index));
    surface.addEventListener('blur', reset);
    surface.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const forward = event.key === 'ArrowRight' || event.key === 'ArrowUp';
      show(event.key === 'Home' ? 0 : event.key === 'End' ? data.length - 1 : index + (forward ? 1 : -1));
    });
    figure.addEventListener('lr:citations-updated',event => {
      if (!Array.isArray(event.detail) || !event.detail.length) return;
      data=event.detail;
      times=data.map(point => Date.parse(point.date+'T00:00:00Z'));
      start=Date.parse(section.dataset.citationStart+'T00:00:00Z');
      end=Date.parse(section.dataset.citationEnd+'T00:00:00Z');span=Math.max(1,end-start);
      max=Math.max(scaleStep,Math.ceil(Math.max(...data.map(point => point.value))/scaleStep)*scaleStep);
      latest=data.at(-1);
      surface.setAttribute('aria-valuemax',data.length-1);
      svg.querySelector('desc').textContent=window.LRCitationCurve.description(latest,hindex ? 'hindex' : 'citations',en,basis);
      reset();render(true);
    });
    if ('ResizeObserver' in window) {
      const observer=new ResizeObserver(schedule);
      observer.observe(figure);
      if (honors) observer.observe(honors);
      honorEntries.forEach(entry=>observer.observe(entry));
    }
    else window.addEventListener('resize', schedule);
    document.fonts?.ready.then(schedule);
    reset();
    render();
    syncMotion();
    motionPreference.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    document.addEventListener('lr:review-mode', syncMotion);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        const entry = entries[0];
        inView = entry.isIntersecting;
        readyToReveal = entry.intersectionRatio >= .75;
        syncVisibility();
      }, {threshold: [0, .75]}).observe(svg);
    } else {
      inView = readyToReveal = true;
      syncVisibility();
    }
  });
})();
