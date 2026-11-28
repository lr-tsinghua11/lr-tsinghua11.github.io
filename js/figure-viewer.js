/* View the original image without losing the reader's place in the paper list. */
(() => {
  'use strict';
  const figures = document.querySelectorAll('.publication-figure[data-figure-name]');
  if (!figures.length || !('HTMLDialogElement' in window)) return;
  const en = document.documentElement.lang === 'en';
  const words = en ? {
    figure: 'Figure', close: 'Close figure', in: 'Zoom in', out: 'Zoom out', fit: 'Fit',
    original: 'Original image', paper: 'Paper', loading: 'Loading figure…',
    previous: 'Previous figure', next: 'Next figure', navigation: 'Browse related figures',
    swipe: 'Swipe to see more', scroll: 'Scroll to see more',
    error: 'The figure could not be loaded. You can open the original image below.',
    region: 'Paper figure. Use the arrow keys or scroll to see details after zooming.'
  } : {
    figure: '论文配图', close: '关闭配图', in: '放大', out: '缩小', fit: '适应窗口',
    original: '原图', paper: '原论文', loading: '正在加载配图…',
    previous: '上一张配图', next: '下一张配图', navigation: '切换相关配图',
    swipe: '左右滑动查看', scroll: '滚动查看细节',
    error: '配图未能加载，可以通过下方链接打开原图。',
    region: '论文配图，放大后可滚动或使用方向键查看细节。'
  };
  const dialog = document.createElement('dialog');
  dialog.className = 'figure-viewer';
  dialog.setAttribute('aria-labelledby', 'figure-viewer-title');
  dialog.setAttribute('aria-describedby', 'figure-viewer-caption');
  dialog.innerHTML = `
    <form method="dialog" class="figure-viewer-header">
      <div><h2 id="figure-viewer-title"></h2><p id="figure-viewer-caption"></p></div>
      <button class="figure-viewer-close" type="submit" aria-label="${words.close}" autofocus>×</button>
    </form>
    <div class="figure-viewer-viewport" id="figure-viewer-viewport" tabindex="0" role="region" aria-label="${words.region}">
      <div class="figure-viewer-canvas"><img alt="" hidden></div>
      <p class="figure-viewer-status" role="status"></p>
    </div>
    <p class="figure-viewer-hint" hidden aria-live="polite"></p>
    <div class="figure-viewer-toolbar">
      <div class="figure-viewer-zoom">
        <button type="button" data-figure-out aria-label="${words.out}" aria-controls="figure-viewer-viewport">−</button>
        <output aria-live="polite">1×</output>
        <button type="button" data-figure-in aria-label="${words.in}" aria-controls="figure-viewer-viewport">+</button>
        <button type="button" data-figure-fit>${words.fit}</button>
      </div>
      <div class="figure-viewer-navigation" role="group" aria-label="${words.navigation}" hidden>
        <button type="button" data-figure-previous aria-label="${words.previous}" title="${words.previous}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button>
        <output data-figure-position aria-live="polite"></output>
        <button type="button" data-figure-next aria-label="${words.next}" title="${words.next}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button>
      </div>
      <div class="figure-viewer-links">
        <a data-figure-paper target="_blank" rel="noopener noreferrer">${words.paper} ↗</a>
        <a data-figure-original target="_blank" rel="noopener noreferrer">${words.original} ↗</a>
      </div>
    </div>`;
  document.body.append(dialog);
  const viewport = dialog.querySelector('.figure-viewer-viewport');
  const canvas = dialog.querySelector('.figure-viewer-canvas');
  const image = canvas.querySelector('img');
  const status = dialog.querySelector('.figure-viewer-status');
  const smaller = dialog.querySelector('[data-figure-out]');
  const larger = dialog.querySelector('[data-figure-in]');
  const zoomOutput = dialog.querySelector('.figure-viewer-zoom output');
  const navigation = dialog.querySelector('.figure-viewer-navigation');
  let zoom = 1, opener = null, scrollBefore = 0;
  let gallery = [], current = 0;

  function fitImage() {
    if (!dialog.open || !image.naturalWidth || image.hidden) return;
    const ratio = image.naturalWidth / image.naturalHeight;
    const width = Math.min(viewport.clientWidth - 2, (viewport.clientHeight - 2) * ratio);
    image.style.width = Math.max(1, Math.round(width * zoom)) + 'px';
    smaller.disabled = zoom === 1;
    larger.disabled = zoom === 3;
    zoomOutput.textContent = zoom + '×';
    const hint = dialog.querySelector('.figure-viewer-hint');
    const horizontal = viewport.scrollWidth > viewport.clientWidth + 2;
    const vertical = viewport.scrollHeight > viewport.clientHeight + 2;
    hint.hidden = !horizontal && !vertical;
    hint.textContent = matchMedia('(max-width:760px)').matches && horizontal && !vertical ? words.swipe : words.scroll;
  }
  function setZoom(value) {
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / canvas.scrollWidth;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / canvas.scrollHeight;
    zoom = Math.max(1, Math.min(3, value));
    fitImage();
    viewport.scrollLeft = centerX * canvas.scrollWidth - viewport.clientWidth / 2;
    viewport.scrollTop = centerY * canvas.scrollHeight - viewport.clientHeight / 2;
  }
  function revealImage() {
    if (!dialog.open || !image.naturalWidth) return;
    image.hidden = false;
    status.hidden = true;
    fitImage();
  }
  function showFigure(index) {
    if (!gallery.length) return;
    current = (index + gallery.length) % gallery.length;
    const figure = gallery[current];
    const link = figure.querySelector(':scope > a');
    const original = figure.querySelector('img');
    dialog.querySelector('h2').textContent = figure.dataset.figureName + ' · ' + words.figure;
    dialog.querySelector('#figure-viewer-caption').textContent = original.alt;
    dialog.querySelector('[data-figure-paper]').href = figure.dataset.figureSource || link.href;
    dialog.querySelector('[data-figure-paper]').textContent = (figure.dataset.figureSourceLabel || words.paper) + ' ↗';
    dialog.querySelector('[data-figure-original]').href = link.href;
    navigation.hidden = gallery.length < 2;
    dialog.querySelector('[data-figure-position]').textContent = (current + 1) + ' / ' + gallery.length;
    image.hidden = true;
    image.alt = original.alt;
    status.textContent = words.loading;
    status.hidden = false;
    image.src = link.href;
    smaller.disabled = zoom === 1;
    larger.disabled = false;
    zoomOutput.textContent = zoom + '×';
    dialog.querySelector('.figure-viewer-hint').hidden = true;
    viewport.scrollTop = viewport.scrollLeft = 0;
    if (image.complete) revealImage();
  }
  image.addEventListener('load', revealImage);
  image.addEventListener('error', () => {
    image.hidden = true;
    status.textContent = words.error;
    status.hidden = false;
  });
  smaller.addEventListener('click', () => setZoom(zoom - 0.5));
  larger.addEventListener('click', () => setZoom(zoom + 0.5));
  dialog.querySelector('[data-figure-fit]').addEventListener('click', () => setZoom(1));
  dialog.querySelector('[data-figure-previous]').addEventListener('click', () => showFigure(current - 1));
  dialog.querySelector('[data-figure-next]').addEventListener('click', () => showFigure(current + 1));
  dialog.addEventListener('keydown', event => {
    // At larger scales the viewport keeps its native arrow-key panning.
    if (gallery.length < 2 || zoom !== 1 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    showFigure(current + (event.key === 'ArrowRight' ? 1 : -1));
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('has-figure-viewer');
    window.scrollTo({top: scrollBefore, behavior: 'instant'});
    if (opener?.isConnected) opener.focus({preventScroll: true});
  });
  if ('ResizeObserver' in window) new ResizeObserver(fitImage).observe(viewport);
  else window.addEventListener('resize', fitImage);

  figures.forEach(figure => {
    const link = figure.querySelector(':scope > a');
    if (!link) return;
    link.setAttribute('aria-haspopup', 'dialog');
    const hint = document.createElement('span');
    hint.className = 'figure-open-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-6 6M4 20l6-6"/></svg>';
    link.append(hint);
    const open = event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
      event.preventDefault();
      opener = event.currentTarget;
      scrollBefore = window.scrollY;
      zoom = matchMedia('(max-width:760px)').matches ? 2 : 1;
      const group = figure.closest('.benchmark-comparison, .publication-figure-stack');
      gallery = group ? Array.from(group.querySelectorAll('.publication-figure[data-figure-name]')) : [figure];
      showFigure(gallery.indexOf(figure));
      document.body.classList.add('has-figure-viewer');
      dialog.showModal();
      viewport.scrollTop = viewport.scrollLeft = 0;
      if (image.complete) revealImage();
    };
    link.addEventListener('click', open);
  });
})();
