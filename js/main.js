/* ═══════════════════════════════════════════════════════
   MOSAÏQUE SOLITAIRE — moteur interactif
   Vidéo locale HTML5 · GSAP 3.13 (ScrollTrigger, SplitText)
   Neige canvas · curseur custom · player · mode cinéma
   ═══════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ─────────── ÉTAT ─────────── */
  let entered = false;
  let seeking = false;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* ═══════════ VIDÉO — STREAMING PAR SEGMENTS (HLS) ═══════════ */
  const video = $('#videoCover'); // balise <video> en fond, mêmes règles CSS cover que l'ancien player

  const HLS_SRC = 'assets/hls/master.m3u8';
  const MP4_SRC = 'assets/mosaique-solitaire.mp4';
  let hls = null;

  // true = lecture par petits segments chargés à la demande (comme YouTube)
  function attachSource() {
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({
        maxBufferLength: 30,        // ~30 s de vidéo en mémoire devant la lecture
        maxMaxBufferLength: 60,
        backBufferLength: 30,       // on relâche ce qui est déjà vu
        maxBufferSize: 30 * 1000 * 1000,
        lowLatencyMode: false,
        enableWorker: true,
      });
      hls.loadSource(HLS_SRC);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = HLS_SRC;          // Safari : HLS natif, déjà progressif
    } else {
      video.src = MP4_SRC;          // dernier recours : MP4 faststart (moov en tête)
    }
  }
  attachSource();

  video.addEventListener('play',  () => document.body.classList.add('playing'));
  video.addEventListener('pause', () => document.body.classList.remove('playing'));
  video.addEventListener('ended', () => { video.currentTime = 0; video.play().catch(() => {}); });

  /* ── lancement robuste : hls.js peut avoir besoin de quelques segments avant play() ── */
  function startPlaybackSafe() {
    const p = video.play();
    if (p) p.catch(() => {
      const retry = () => video.play().catch(() => {});
      if (video.readyState >= 2) setTimeout(retry, 300);
      else video.addEventListener('canplay', retry, { once: true });
    });
  }

  /* ── Entrée dans l'expérience (le clic = geste qui débloque l'audio) ── */
  function enterExperience(withSound) {
    if (entered) return;
    entered = true;
    document.body.classList.add('entered');
    document.body.dataset.loaded = 'true';

    try {
      if (withSound) {
        video.muted = false;
        video.volume = 0.85;
      } else {
        video.muted = true;
        document.body.classList.add('muted');
      }
      startPlaybackSafe();
    } catch (_) { /* le navigateur peut exiger un 2e geste */ }

    $('#gate').classList.add('is-open');
    initHeroReveal();
    setTimeout(() => $('#gate').remove(), 1200);
  }

  $('#enterBtn').addEventListener('click', () => enterExperience(true));
  $('#enterMutedBtn').addEventListener('click', () => enterExperience(false));

  /* ═══════════ CONTRÔLES ═══════════ */
  $('#soundBtn').addEventListener('click', () => {
    video.muted = !video.muted;
    document.body.classList.toggle('muted', video.muted);
    $('#soundBtn').setAttribute('aria-pressed', String(!video.muted));
  });

  $('#playBtn').addEventListener('click', () => {
    if (video.paused) {
      video.muted = false;
      document.body.classList.remove('muted');
      startPlaybackSafe();
    } else {
      video.pause();
    }
  });

  /* ── Barre de progression + seek ── */
  const bar = $('#seekBar'), fill = $('#barFill'), knob = $('#barKnob'), timeLabel = $('#timeLabel');

  const fmt = s => {
    s = Math.max(0, Math.floor(s || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const getDuration = () => (isFinite(video.duration) && video.duration) || 305;

  function renderProgress() {
    if (seeking) return;
    const t = video.currentTime || 0;
    const d = getDuration() || 1;
    const p = Math.min(100, (t / d) * 100);
    fill.style.width = `${p}%`;
    knob.style.left = `${p}%`;
    timeLabel.textContent = `${fmt(t)} / ${fmt(d)}`;
    bar.setAttribute('aria-valuenow', Math.floor(t));
  }
  setInterval(renderProgress, 250);

  function seekFromEvent(e) {
    const rect = bar.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const ratio = Math.min(1, Math.max(0, x / rect.width));
    const t = ratio * getDuration();
    fill.style.width = knob.style.left = `${ratio * 100}%`;
    video.currentTime = t;
    video.play().catch(() => {});
  }
  bar.addEventListener('pointerdown', e => { seeking = true; seekFromEvent(e); bar.setPointerCapture(e.pointerId); });
  bar.addEventListener('pointermove', e => seeking && seekFromEvent(e));
  bar.addEventListener('pointerup', () => { seeking = false; });
  bar.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') video.currentTime = (video.currentTime || 0) + 5;
    if (e.key === 'ArrowLeft') video.currentTime = Math.max(0, (video.currentTime || 0) - 5);
  });

  /* ── Scènes du clip : jump au timestamp ── */
  $$('.scene').forEach(btn => {
    btn.addEventListener('click', () => {
      video.currentTime = Number(btn.dataset.time) || 0;
      video.muted = false;
      document.body.classList.remove('muted');
      video.play().catch(() => {});
      window.scrollTo({ top: 0, behavior: 'smooth' });
      btn.classList.add('is-active');
      setTimeout(() => btn.classList.remove('is-active'), 1200);
    });
  });

  /* ── Mode cinéma ── */
  const toggleTheater = on => document.body.classList.toggle('theater-mode', on);
  $('#theaterBtn').addEventListener('click', () => toggleTheater(!document.body.classList.contains('theater-mode')));
  $('#theaterClose').addEventListener('click', () => toggleTheater(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleTheater(false); });

  /* ── Tuile « revoir le clip » de la mosaïque ── */
  const replayTile = $('#replayTile');
  if (replayTile) {
    replayTile.addEventListener('click', () => {
      video.currentTime = 0;
      video.muted = false;
      document.body.classList.remove('muted');
      video.play().catch(() => {});
      toggleTheater(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ═══════════ CURSEUR CUSTOM ═══════════ */
  const cursor = $('#cursor');
  if (window.matchMedia('(pointer:fine)').matches) {
    let cx = -100, cy = -100, tx = -100, ty = -100;
    document.addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; });
    (function loop() {
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      cursor.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    })();
    document.addEventListener('mousedown', () => cursor.classList.add('is-down'));
    document.addEventListener('mouseup', () => cursor.classList.remove('is-down'));
    const hoverables = 'a, button, .scene, .tile, .frag, .player__bar, .chap';
    document.addEventListener('mouseover', e => {
      cursor.classList.toggle('is-hover', !!e.target.closest(hoverables));
    });
  }

  /* ═══════════ NEIGE (canvas) ═══════════ */
  const snowCanvas = $('#snow');
  const ctx = snowCanvas.getContext('2d');
  let flakes = [];

  function sizeSnow() {
    snowCanvas.width = window.innerWidth;
    snowCanvas.height = window.innerHeight;
  }
  sizeSnow();
  window.addEventListener('resize', sizeSnow);

  function makeFlakes() {
    const n = Math.min(180, Math.floor(window.innerWidth / 9));
    flakes = Array.from({ length: n }, () => ({
      x: Math.random() * snowCanvas.width,
      y: Math.random() * snowCanvas.height,
      r: 0.6 + Math.random() * 2.4,
      v: 0.3 + Math.random() * 1.1,
      drift: Math.random() * 1.4 - 0.7,
      phase: Math.random() * Math.PI * 2,
      o: 0.25 + Math.random() * 0.6,
    }));
  }
  makeFlakes();
  window.addEventListener('resize', makeFlakes);

  let audioBeat = 0;
  (function snowLoop() {
    ctx.clearRect(0, 0, snowCanvas.width, snowCanvas.height);
    for (const f of flakes) {
      f.phase += 0.008;
      f.y += f.v;
      f.x += f.drift + Math.sin(f.phase) * 0.4 + audioBeat;
      if (f.y > snowCanvas.height + 6) { f.y = -6; f.x = Math.random() * snowCanvas.width; }
      if (f.x > snowCanvas.width + 6) f.x = -6;
      if (f.x < -6) f.x = snowCanvas.width + 6;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(234,242,251,${f.o})`;
      ctx.fill();
    }
    audioBeat *= 0.92; // léger frémissement « sonore »
    requestAnimationFrame(snowLoop);
  })();

  /* ═══════════ GSAP : ANIMATIONS ═══════════ */
  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    if (window.SplitText) gsap.registerPlugin(SplitText);

    /* ── Hero : titre en éclats ── */
    window.initHeroReveal = function () {
      if (reducedMotion || !window.SplitText) {
        gsap.from('.hero__title, .hero__eyebrow, .hero__tag', { opacity: 0, y: 30, duration: 1, stagger: 0.12, ease: 'expo.out' });
        return;
      }
      $$('.hero__title .ht__word').forEach(word => {
        const split = new SplitText(word, { type: 'chars' });
        gsap.from(split.chars, {
          opacity: 0, y: 90, rotateX: -60, duration: 1.1,
          stagger: 0.035, ease: 'expo.out', delay: 0.15,
        });
      });
      gsap.from('.ht__gamma', { scale: 0, rotate: -120, duration: 1, ease: 'back.out(2)', delay: 0.7 });
      gsap.from('.hero__eyebrow, .hero__tag, .hero__scroll, .hero__frame', {
        opacity: 0, y: 24, duration: 1, stagger: 0.08, ease: 'expo.out', delay: 0.5,
      });
      gsap.from('.marquee', { yPercent: 100, opacity: 0, duration: 1, ease: 'expo.out', delay: 0.8 });
    };

    /* ── Titres de sections : SplitText au scroll ── */
    if (window.SplitText && !reducedMotion) {
      $$('.sec-head__title').forEach(title => {
        const split = new SplitText(title, { type: 'chars' });
        gsap.from(split.chars, {
          opacity: 0, y: 60, rotateX: -50, duration: 0.8, stagger: 0.02, ease: 'expo.out',
          scrollTrigger: { trigger: title, start: 'top 88%', toggleActions: 'play none none reverse' },
        });
      });
    }

    /* ── Chapitres ── */
    $$('.chap').forEach(chap => {
      gsap.from(chap, {
        opacity: 0, y: 60, duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: chap, start: 'top 85%', toggleActions: 'play none none reverse' },
      });
      const glyph = $('.chap__glyph', chap);
      if (glyph && !reducedMotion) {
        gsap.to(glyph, {
          yPercent: -30, ease: 'none',
          scrollTrigger: { trigger: chap, start: 'top bottom', end: 'bottom top', scrub: 1 },
        });
      }
    });

    /* ── Scènes : reveal en cascade ── */
    gsap.from('.scene', {
      opacity: 0, y: 50, duration: 0.7, stagger: 0.09, ease: 'power3.out',
      scrollTrigger: { trigger: '#scenes', start: 'top 80%', toggleActions: 'play none none reverse' },
    });

    /* ── Fragments ── */
    gsap.from('.frag', {
      opacity: 0, scale: 0.96, y: 30, duration: 0.7, stagger: 0.07, ease: 'power3.out',
      scrollTrigger: { trigger: '.frag-grid', start: 'top 82%', toggleActions: 'play none none reverse' },
    });

    /* ── Tuiles de la mosaïque ── */
    gsap.from('.tile', {
      opacity: 0, y: 70, rotateX: -30, duration: 0.8, stagger: { each: 0.06, from: 'random' }, ease: 'power3.out',
      scrollTrigger: { trigger: '#tiles', start: 'top 82%', toggleActions: 'play none none reverse' },
    });

    /* ── Compteurs ── */
    $$('.stat__val').forEach(el => {
      const target = Number(el.dataset.count);
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const obj = { v: 0 };
      ScrollTrigger.create({
        trigger: el, start: 'top 88%', once: true,
        onEnter: () => {
          gsap.to(obj, {
            v: target, duration: 1.8, ease: 'expo.out',
            onUpdate: () => { el.textContent = `${prefix}${Math.round(obj.v)}${suffix}`; },
          });
          gsap.from(el, { scale: 1.4, opacity: 0, duration: 1, ease: 'expo.out' });
        },
      });
    });

    /* ── Parallaxe du hero au scroll ── */
    if (!reducedMotion) {
      gsap.to('.hero__title', {
        yPercent: -18, opacity: 0.25, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      });
    }
  } else {
    // pas de GSAP : fallback visible
    document.querySelectorAll('[data-split]').forEach(el => el.style.opacity = 1);
  }

  /* ═══════════ NAV : liens ancrés ═══════════ */
  $$('[data-nav]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      const target = id && id.startsWith('#') && $(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    });
  });

  /* ═══════════ NEIGE RÉACTIVE AU SON ═══════════
     La vidéo locale ne traverse pas le CSP du canvas audio :
     on pulse la neige à un rythme musical estimé (~95 BPM). */
  setInterval(() => { audioBeat = 0.5; }, 630);

})();
