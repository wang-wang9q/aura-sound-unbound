(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const colors = {
    moss: { name: '苔绿', index: '01', english: 'MOSS GREEN', hex: '#5D6845', filter: 'none', background: '#e9ecdf' },
    sand: { name: '砂岩', index: '02', english: 'WARM SAND', hex: '#C5BFA8', filter: 'saturate(0.25) brightness(1.85) sepia(0.3)', background: '#eae5da' },
    graphite: { name: '石墨', index: '03', english: 'SOFT GRAPHITE', hex: '#424744', filter: 'grayscale(1) brightness(0.65)', background: '#dfe2dc' }
  };
  const scenes = {
    studio: { description: '暖调和弦 × 松弛节奏，为忙碌按下暂停。', tone: '#60734a' },
    outdoor: { description: '轻盈拨弦 × 明亮旋律，把心情带到旷野。', tone: '#7d8b42' },
    night: { description: '深调氛围 × 稀疏音符，留一点时间给自己。', tone: '#596b76' }
  };
  let currentColor = 'moss';
  let currentScene = 'studio';
  let toastTimeout;
  let busyAudio = false;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function toast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => $('#toast').classList.remove('visible'), 3600);
  }
  function setColor(color, persist = true) {
    if (!colors[color]) return;
    currentColor = color;
    const config = colors[color];
    document.documentElement.style.setProperty('--product-filter', config.filter);
    $('.configure-visual').style.backgroundColor = config.background;
    $$('.current-color').forEach(label => { label.textContent = `${config.index} / ${config.name}`; });
    $('#config-color-code').textContent = `${config.english} — ${config.hex}`;
    $$('[data-color]').forEach(button => {
      const selected = button.dataset.color === color;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $$('.product-image').forEach(image => image.alt = `AURA / 01 ${config.name}便携音响，穿孔格栅与编织手绳`);
    if (persist) { try { localStorage.setItem('aura-color', color); } catch { return false; } }
    return true;
  }
  $$('[data-color]').forEach(button => button.addEventListener('click', () => setColor(button.dataset.color)));
  try { const saved = localStorage.getItem('aura-color'); if (saved && colors[saved]) setColor(saved, false); } catch { /* Keep the default in private browsing. */ }

  const waveContainer = $('#wave-bars');
  const waveBars = Array.from({ length: 96 }, (_, index) => {
    const bar = document.createElement('i');
    const center = Math.sin(index / 95 * Math.PI);
    const pattern = Math.abs(Math.sin(index * 0.53) * Math.cos(index * 0.16));
    bar.style.setProperty('--bar-height', `${12 + center * (24 + pattern * 86)}px`);
    waveContainer.append(bar);
    return bar;
  });
  let waveVisible = false;
  let waveFrame = 0;
  const waveObserver = new IntersectionObserver(entries => {
    waveVisible = entries[0].isIntersecting;
    if (waveVisible && window.AuraAudio?.isPlaying()) startWave();
    else stopWave();
  }, { threshold: 0.05 });
  waveObserver.observe($('.sound-player'));
  function renderWave(time) {
    if (!waveVisible || !window.AuraAudio?.isPlaying() || document.hidden || reduceMotion.matches) { waveFrame = 0; return; }
    const speed = currentScene === 'night' ? 0.0012 : currentScene === 'outdoor' ? 0.0031 : 0.002;
    waveBars.forEach((bar, i) => {
      const scale = 0.3 + (Math.sin(time * speed + i * 0.19) + 1) * 0.36 + Math.sin(time * 0.007 + i * 0.54) * 0.15;
      bar.style.transform = `scaleY(${scale.toFixed(3)})`;
    });
    waveFrame = requestAnimationFrame(renderWave);
  }
  function startWave() { if (!waveFrame && !reduceMotion.matches && waveVisible) waveFrame = requestAnimationFrame(renderWave); }
  function stopWave() { cancelAnimationFrame(waveFrame); waveFrame = 0; waveBars.forEach(bar => bar.style.transform = ''); }
  function updateScene(scene) {
    currentScene = scene;
    $$('.scene-tab').forEach(button => {
      const active = button.dataset.scene === scene;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('#scene-description').textContent = scenes[scene].description;
    waveBars.forEach(bar => bar.style.backgroundColor = scenes[scene].tone);
  }
  $$('.scene-tab').forEach(button => button.addEventListener('click', () => {
    const scene = button.dataset.scene;
    updateScene(scene);
    window.AuraAudio?.setScene(scene);
  }));
  if (window.AuraAudio) {
    AuraAudio.setVolume(0.35);
    AuraAudio.subscribe(state => {
      document.body.classList.toggle('playing', state.playing);
      $$('[data-audio-toggle]').forEach(button => {
        button.setAttribute('aria-pressed', String(state.playing));
        button.setAttribute('aria-label', state.playing ? '暂停原创声景试听' : '播放原创声景试听');
      });
      $('.audio-label').textContent = state.playing ? '正在聆听' : '听见 AURA';
      $('.play-icon').textContent = state.playing ? 'Ⅱ' : '▶';
      $('#play-status').textContent = state.playing ? 'NOW PLAYING' : 'READY TO LISTEN';
      if (state.playing) startWave(); else stopWave();
      if (state.error) toast('当前浏览器暂时无法播放，请尝试其他浏览器。');
    });
  }
  $$('[data-audio-toggle]').forEach(button => button.addEventListener('click', async () => {
    if (busyAudio) return;
    if (!window.AuraAudio) { toast('试听暂时无法加载，请刷新页面后重试。'); return; }
    busyAudio = true;
    try { if (AuraAudio.isPlaying()) AuraAudio.stop(); else await AuraAudio.play(currentScene); }
    catch { toast('试听暂时无法播放，请稍后重试。'); }
    finally { busyAudio = false; }
  }));
  $('#volume').addEventListener('input', event => window.AuraAudio?.setVolume(Number(event.target.value) / 100));
  reduceMotion.addEventListener('change', () => { if (reduceMotion.matches) stopWave(); else if (window.AuraAudio?.isPlaying()) startWave(); });

  const details = [
    { index: '01 / THE TEXTURE', name: '触得到的细腻', description: '细密穿孔与柔触织物相遇，让声音通透，也让每次触碰多一分温度。' },
    { index: '02 / THE CONTROL', name: '操作，回到直觉', description: '三枚实体按键，指尖就能找到。音量与播放，不必每次都拿起手机。' },
    { index: '03 / THE FREEDOM', name: '随手，便能出发', description: '同色编织手绳，轻轻套上手腕。把一首歌带出门，把自由握在手里。' }
  ];
  $$('.hotspot').forEach(button => button.addEventListener('click', () => {
    const detail = details[Number(button.dataset.detail)];
    $$('.hotspot').forEach(other => { const active = other === button; other.classList.toggle('active', active); other.setAttribute('aria-pressed', String(active)); });
    $('#detail-index').textContent = detail.index;
    $('#detail-name').textContent = detail.name;
    $('#detail-description').textContent = detail.description;
    if (window.gsap && !reduceMotion.matches) gsap.fromTo('.detail-tooltip', { y: 8, opacity: 0.3 }, { y: 0, opacity: 1, duration: 0.35, overwrite: true });
  }));

  const menuToggle = $('.menu-toggle');
  const mobileNav = $('#mobile-nav');
  function closeMenu() { mobileNav.hidden = true; menuToggle.setAttribute('aria-expanded', 'false'); menuToggle.setAttribute('aria-label', '打开导航'); }
  menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
    mobileNav.hidden = expanded;
    menuToggle.setAttribute('aria-expanded', String(!expanded));
    menuToggle.setAttribute('aria-label', expanded ? '打开导航' : '关闭导航');
  });
  $$('a', mobileNav).forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.addEventListener('click', event => { if (!mobileNav.hidden && !mobileNav.contains(event.target) && !menuToggle.contains(event.target)) closeMenu(); });
  window.matchMedia('(min-width: 761px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

  const dialog = $('#config-dialog');
  $('#save-config').addEventListener('click', () => {
    const saved = setColor(currentColor);
    $('p', dialog).innerHTML = saved ? '这个颜色已经为你保存。<br>下载灵感卡，把今天的好心情带走。' : '这个颜色已经为你选好。<br>浏览器未允许保存，下载灵感卡把它带走。';
    dialog.showModal();
    document.body.classList.add('dialog-open');
  });
  $('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  $('#download-card').addEventListener('click', async () => {
    const button = $('#download-card');
    button.disabled = true;
    try {
      await document.fonts.ready;
      const speaker = $('.hero-product');
      await speaker.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1200; canvas.height = 1500;
      const ctx = canvas.getContext('2d');
      const config = colors[currentColor];
      ctx.fillStyle = '#f2f2e9'; ctx.fillRect(0, 0, 1200, 1500);
      ctx.fillStyle = '#26382d'; ctx.font = '800 100px Manrope, Arial'; ctx.fillText('aura', 80, 155);
      ctx.font = '500 20px Manrope, Arial'; ctx.fillText('AURA / 01 — YOUR SOUND, YOUR WAY', 85, 221);
      ctx.fillStyle = config.background; ctx.beginPath(); ctx.arc(600, 685, 390, 0, Math.PI * 2); ctx.fill();
      const productCanvas = document.createElement('canvas');
      productCanvas.width = speaker.naturalWidth; productCanvas.height = speaker.naturalHeight;
      const productContext = productCanvas.getContext('2d', { willReadFrequently: true });
      productContext.drawImage(speaker, 0, 0);
      if (currentColor !== 'moss') {
        const pixels = productContext.getImageData(0, 0, productCanvas.width, productCanvas.height);
        const data = pixels.data;
        for (let i = 0; i < data.length; i += 4) {
          if (!data[i + 3]) continue;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (currentColor === 'graphite') {
            data[i] = data[i + 1] = data[i + 2] = luminance * 0.65;
          } else {
            const red = (luminance + 0.25 * (r - luminance)) * 1.85;
            const green = (luminance + 0.25 * (g - luminance)) * 1.85;
            const blue = (luminance + 0.25 * (b - luminance)) * 1.85;
            data[i] = red * 0.7 + (0.393 * red + 0.769 * green + 0.189 * blue) * 0.3;
            data[i + 1] = green * 0.7 + (0.349 * red + 0.686 * green + 0.168 * blue) * 0.3;
            data[i + 2] = blue * 0.7 + (0.272 * red + 0.534 * green + 0.131 * blue) * 0.3;
          }
        }
        productContext.putImageData(pixels, 0, 0);
      }
      ctx.save(); ctx.translate(600, 685); ctx.rotate(-0.18); ctx.drawImage(productCanvas, -520, -241, 1040, 482); ctx.restore();
      ctx.fillStyle = '#26382d'; ctx.font = '500 82px Manrope, Arial'; ctx.fillText('Sound. Unbound.', 80, 1160);
      ctx.font = '400 27px Manrope, Arial'; ctx.fillText(config.english + ' / ' + config.name, 85, 1240);
      ctx.strokeStyle = '#c9d0bc'; ctx.beginPath(); ctx.moveTo(85, 1290); ctx.lineTo(1115, 1290); ctx.stroke();
      ctx.font = '400 19px Manrope, Arial'; ctx.fillText('360° SOUND  /  24H PLAYTIME  /  580G', 85, 1340);
      ctx.fillStyle = '#7b866e'; ctx.font = '400 17px Manrope, Arial'; ctx.fillText('独立概念设计 · 参数为设计目标 · 2026', 85, 1420);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Export unavailable');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `AURA-01-${config.english.replaceAll(' ', '-')}.png`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast('专属灵感卡已下载。');
    } catch { toast('灵感卡未能导出，请稍后再试。'); }
    finally { button.disabled = false; }
  });

  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add({ desktop: '(min-width: 761px)', mobile: '(max-width: 760px)', motion: '(prefers-reduced-motion: no-preference)' }, context => {
      if (!context.conditions.motion) return;
      const desktop = context.conditions.desktop;
      const intro = gsap.timeline({ defaults: { ease: 'power3.out', duration: 1.15 } });
      intro.from('.hero-topline', { y: 10, autoAlpha: 0, duration: 0.7 }, 0.05)
        .from('.title-line', { y: 50, autoAlpha: 0, stagger: 0.12 }, 0.13)
        .from('.hero-chinese', { y: 15, autoAlpha: 0, duration: 0.8 }, 0.5)
        .from('.hero-stage', { scale: 0.92, autoAlpha: 0, x: 35, duration: 1.5 }, 0.2)
        .from('.hero-bottom', { y: 15, autoAlpha: 0, duration: 0.8 }, 0.55);
      gsap.to('.hero-product-float', { y: -13, rotation: -1.5, duration: 3.5, ease: 'sine.inOut', repeat: -1, yoyo: true });
      gsap.to('.hero-stage', { y: desktop ? 85 : 25, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1 } });
      $$('.reveal').forEach(element => gsap.from(element, { y: 28, autoAlpha: 0, duration: 0.85, ease: 'power2.out', scrollTrigger: { trigger: element, start: 'top 89%', once: true } }));
      gsap.from('.sound-player', { y: 35, autoAlpha: 0, duration: 0.9, scrollTrigger: { trigger: '.sound-player', start: 'top 89%', once: true } });
      gsap.fromTo('.detail-product-wrap', { y: 55, rotation: 7 }, { y: -15, rotation: -3, ease: 'none', scrollTrigger: { trigger: '.detail-stage', start: 'top 90%', end: 'bottom 25%', scrub: 1.2 } });
      if (desktop) gsap.fromTo('.lifestyle-image', { yPercent: -3 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: '.everyday-section', start: 'top bottom', end: 'bottom top', scrub: 1 } });
      gsap.from('.config-product', { y: 35, rotation: 3, duration: 1, ease: 'power2.out', scrollTrigger: { trigger: '.configure-visual', start: 'top 80%', once: true } });
      return () => { /* gsap.matchMedia reverts the animations and triggers. */ };
    });
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: self => { $('.page-progress').style.transform = `scaleX(${self.progress})`; } });
    Promise.all([document.fonts.ready, ...$$('img').map(img => img.decode().catch(() => {}))]).then(() => ScrollTrigger.refresh());
    window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
  }
  if (window.matchMedia('(pointer: fine)').matches && !reduceMotion.matches && window.gsap) {
    const stage = $('.hero-stage');
    stage.addEventListener('pointermove', event => {
      if (reduceMotion.matches) return;
      const bounds = stage.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      gsap.to('.hero-product', { x: x * 14, y: y * 10, rotation: -14 + x * 3, duration: 0.8, ease: 'power2.out', overwrite: 'auto' });
    });
    stage.addEventListener('pointerleave', () => gsap.to('.hero-product', { x: 0, y: 0, rotation: -14, duration: reduceMotion.matches ? 0 : 1, ease: 'power2.out', overwrite: 'auto' }));
    reduceMotion.addEventListener('change', event => {
      if (event.matches) { gsap.killTweensOf('.hero-product'); gsap.set('.hero-product', { x: 0, y: 0, rotation: -14 }); }
    });
  }
  window.addEventListener('pagehide', () => { stopWave(); waveObserver.disconnect(); clearTimeout(toastTimeout); });
  window.addEventListener('pageshow', event => { if (event.persisted) { waveObserver.observe($('.sound-player')); window.ScrollTrigger?.refresh(); } });
})();
