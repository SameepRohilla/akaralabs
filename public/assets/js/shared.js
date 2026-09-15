/* ============================================================
   AKARA LABS — shared behaviour · v2 "Ratri"
   nav, logo, hero object, reveals, counters, marquee,
   magnetic buttons, parallax, WhatsApp FAB, i18n
   ============================================================ */
(function () {
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Logo markup (all 3 variants rendered; CSS shows active) ----
  var LAYERS_SVG =
    '<svg viewBox="0 0 34 34" aria-hidden="true">' +
      '<rect x="13" y="4"  width="8"  height="3" rx="0.5" fill="var(--terra)"/>' +
      '<rect x="11" y="8.4" width="12" height="3" rx="0.5" fill="currentColor"/>' +
      '<rect x="9"  y="12.8" width="16" height="3" rx="0.5" fill="currentColor"/>' +
      '<rect x="7"  y="17.2" width="20" height="3" rx="0.5" fill="currentColor"/>' +
      '<rect x="5"  y="21.6" width="24" height="3" rx="0.5" fill="currentColor"/>' +
      '<rect x="3"  y="26"  width="28" height="3" rx="0.5" fill="currentColor"/>' +
    '</svg>';

  function logoInner(word) {
    return (
      '<span class="logo-mark">' +
        '<span class="lv lv-devanagari"><span class="mark-seal"><span>अ</span></span></span>' +
        '<span class="lv lv-layers mark-layers" style="color:var(--ink)">' + LAYERS_SVG + '</span>' +
      '</span>' +
      '<span class="lv lv-wordmark logo-word">akara<span class="labs">&nbsp;labs</span></span>' +
      '<span class="logo-word logo-word-default">akara<span class="labs">&nbsp;labs</span></span>'
    );
  }

  document.querySelectorAll('.logo').forEach(function (el) {
    el.innerHTML = logoInner();
  });
  var styleFix = document.createElement('style');
  styleFix.textContent =
    '[data-logo="wordmark"] .logo-word-default{display:none}' +
    '.lv-wordmark .labs{color:var(--ink-faint)}' +
    '.lv-wordmark{position:relative}' +
    '.lv-wordmark::after{content:"";position:absolute;left:0;bottom:-3px;width:0.62em;height:2px;' +
      'background:var(--grad-saffron);border-radius:1px;box-shadow:0 0 8px rgba(242,163,60,0.5)}';
  document.head.appendChild(styleFix);

  // ---- Nav: scroll shadow + mobile toggle ----
  //
  // The nav is a React component. Moving between the marketing site and the
  // signed-in dashboard swaps one layout for the other, so these elements are
  // destroyed and rebuilt — and anything bound to the old ones is gone with
  // them. Re-query on every call rather than closing over a snapshot.
  var navScrollBound = false;
  function initNav() {
    var nav = document.querySelector('.nav');
    if (nav) {
      var onScroll = function () {
        var n = document.querySelector('.nav');
        if (n) n.classList.toggle('scrolled', window.scrollY > 8);
      };
      onScroll();
      if (!navScrollBound) { navScrollBound = true; window.addEventListener('scroll', onScroll, { passive: true }); }
    }

    var toggle = document.querySelector('.nav-toggle');
    var links = document.querySelector('.nav-links');
    if (!toggle || !links || toggle.hasAttribute('data-ak-nav')) return;
    toggle.setAttribute('data-ak-nav', '1');

    var startCta = document.querySelector('.nav-cta a.btn');
    if (startCta && !links.querySelector('.nav-mobile-cta')) {
      var m = document.createElement('a');
      m.className = 'nav-mobile-cta';
      m.setAttribute('href', startCta.getAttribute('href'));
      m.textContent = startCta.textContent.trim();
      links.appendChild(m);
    }
    toggle.addEventListener('click', function () { links.classList.toggle('open'); });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { links.classList.remove('open'); });
    });
  }

  // ---- Theme: dark "Ratri" ⇄ light "Haveli" ----
  // First visit follows the visitor's system preference; the nav
  // toggle overrides it and the choice persists in localStorage.
  var mountThemeToggle = function () {};
  (function theme() {
    var KEY = 'akara-theme';
    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
    function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
    function systemTheme() { return mq && mq.matches ? 'light' : 'dark'; }
    function apply(t, animate) {
      if (animate) {
        document.documentElement.classList.add('theme-anim');
        setTimeout(function () { document.documentElement.classList.remove('theme-anim'); }, 520);
      }
      if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', t === 'light' ? '#F6F0E3' : '#0C0B09');
      [].forEach.call(document.querySelectorAll('.theme-toggle'), function (b) {
        b.setAttribute('aria-label', t === 'light'
          ? 'Switch to dark theme / डार्क थीम'
          : 'Switch to light theme / लाइट थीम');
      });
    }
    apply(stored() || systemTheme(), false);
    // Follow live system changes until the visitor makes an explicit choice.
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', function () { if (!stored()) apply(systemTheme(), true); });
    }
    // The <html> data-theme attribute survives a route change; the button does
    // not, because it is injected into the nav. So re-mounting it is all that
    // is needed — and re-applying, so its label matches the current theme.
    mountThemeToggle = function () {
      var cta = document.querySelector('.nav-cta');
      if (!cta || cta.querySelector('.theme-toggle')) {
        apply(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark', false);
        return;
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-toggle';
      btn.innerHTML =
        '<svg class="ic-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>' +
        '<svg class="ic-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.4"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="5.3" y1="5.3" x2="7" y2="7"/><line x1="17" y1="17" x2="18.7" y2="18.7"/><line x1="5.3" y1="18.7" x2="7" y2="17"/><line x1="17" y1="7" x2="18.7" y2="5.3"/></svg>';
      cta.insertBefore(btn, cta.firstChild);
      btn.addEventListener('click', function () {
        var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        try { localStorage.setItem(KEY, next); } catch (e) {}
        apply(next, true);
      });
      apply(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark', false);
    };
    mountThemeToggle();
  })();

  // ---- Floating WhatsApp button (every page) ----
  (function waFab() {
    if (document.querySelector('.wa-fab')) return;
    var a = document.createElement('a');
    a.className = 'wa-fab';
    a.href = 'https://wa.me/917082089049';
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', 'Chat on WhatsApp / व्हाट्सऐप पर बात करें');
    a.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16.04 4C9.46 4 4.1 9.36 4.1 15.94c0 2.1.55 4.15 1.6 5.95L4 28l6.27-1.64a11.9 11.9 0 0 0 5.76 1.47h.01c6.58 0 11.93-5.36 11.93-11.94C27.97 9.36 22.62 4 16.04 4zm0 21.82h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.72.97.99-3.63-.23-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.46 4.45-9.9 9.92-9.9a9.86 9.86 0 0 1 9.89 9.92c0 5.46-4.45 9.86-9.93 9.86zm5.44-7.4c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.11 3.22 5.1 4.51.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.58-.09 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35z"/></svg>';
    document.body.appendChild(a);
  })();

  // ---- Hero: morphing layered form + schematic elevation ----
  // The disc stack re-forms into a new silhouette every few seconds:
  // ideas, literally taking form. All profiles are 26 diameters, bottom→top.
  var PROFILES = [
    { name: 'a vessel · कलश',           p: [60,76,88,98,106,112,116,118,118,116,112,106,98,90,82,74,68,62,58,56,58,62,68,76,82,72] },
    { name: 'a drone canopy · ड्रोन कैनोपी', p: [116,118,118,116,114,112,108,104,100,96,90,84,78,72,64,56,50,44,38,32,26,20,16,12,8,4] },
    { name: 'a turbine hub · टरबाइन हब',   p: [70,108,124,126,120,108,90,70,52,40,32,28,26,24,24,24,24,24,26,28,30,32,36,40,46,38] },
    { name: 'a bottle · बोतल',           p: [78,90,96,100,102,102,100,98,96,94,90,84,74,60,46,36,30,27,26,26,26,27,28,30,34,26] },
    { name: 'a gear stack · गियर',        p: [96,106,106,106,96,54,54,96,106,106,106,96,54,54,80,88,88,80,48,48,64,70,70,64,40,40] },
    { name: 'a lamp · दीया',             p: [92,98,70,44,32,26,24,22,22,22,24,26,30,34,40,50,68,90,108,118,122,120,112,100,84,90] },
    { name: 'a chess pawn · मोहरा',       p: [104,110,100,80,56,40,30,26,24,22,22,22,24,26,30,36,46,56,64,68,70,68,62,52,38,22] },
    { name: 'an award · ट्रॉफ़ी',          p: [100,106,80,48,32,26,24,24,26,30,36,44,54,64,74,84,94,102,108,114,118,120,120,116,108,90] }
  ];
  var PROFILE = PROFILES[0].p;
  var SPACING = 7;

  // `obj` stays module-scoped because the reveal fallback below reaches for
  // it. It is reassigned on every call so it points at the hero that is
  // currently on the page, not the one from the first load.
  var obj = null;
  function initHero() {
    obj = document.getElementById('hero-object');
    if (obj && !obj.hasAttribute('data-ak-hero')) {
      obj.setAttribute('data-ak-hero', '1');   // the animation loop must not be started twice
    if (obj) {
      var n = PROFILE.length;
      var accent = n - 2;
      var discs = [];
      function setSize(el, d) {
        el.style.width = d + 'px';
        el.style.height = d + 'px';
        el.style.marginLeft = (-d / 2) + 'px';
        el.style.marginTop = (-d / 2) + 'px';
      }
      PROFILE.forEach(function (d, i) {
        var disc = document.createElement('span');
        disc.className = 'disc' + (i === accent ? ' disc-accent' : '');
        setSize(disc, d);
        disc.style.transform = 'translateZ(' + (i * SPACING) + 'px)';
        disc.style.animationDelay = (140 + i * 55) + 'ms';
        obj.appendChild(disc);
        discs.push(disc);
      });
      obj.style.setProperty('--obj-h', (n * SPACING) + 'px');

      // caption under the form
      var art = obj.closest('.hero-art');
      var cap = null;
      if (art) {
        cap = document.createElement('div');
        cap.className = 'hero-form-cap';
        cap.innerHTML = '<span class="dot"></span><span class="t">now forming — ' + PROFILES[0].name + '</span>';
        art.appendChild(cap);
      }

      // morph cycle — pauses while the visitor hovers over the form
      if (!REDUCED) {
        var cur = 0, animating = false, hovered = false;
        if (art) {
          art.addEventListener('pointerenter', function () { hovered = true; });
          art.addEventListener('pointerleave', function () { hovered = false; });
        }
        function ease(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
        function morphTo(idx) {
          if (animating) return;
          animating = true;
          var from = PROFILES[cur].p, to = PROFILES[idx].p;
          var DUR = 1100, t0 = null, swapped = false;
          if (cap) cap.classList.add('fading');
          function frame(t) {
            if (!t0) t0 = t;
            var p = Math.min((t - t0) / DUR, 1);
            var e = ease(p);
            for (var i = 0; i < n; i++) setSize(discs[i], from[i] + (to[i] - from[i]) * e);
            if (!swapped && p >= 0.5 && cap) {
              swapped = true;
              cap.querySelector('.t').textContent = 'now forming — ' + PROFILES[idx].name;
              cap.classList.remove('fading');
            }
            if (p < 1) requestAnimationFrame(frame);
            else { cur = idx; animating = false; }
          }
          requestAnimationFrame(frame);
        }
        setInterval(function () {
          if (document.hidden || hovered) return;
          morphTo((cur + 1) % PROFILES.length);
        }, 4200);
      }
    }

    }

    var elev = document.getElementById('hero-elevation');
    if (elev && !elev.hasAttribute('data-ak-elev')) {
      elev.setAttribute('data-ak-elev', '1');
    if (elev) {
      PROFILE.forEach(function (d, i) {
        var bar = document.createElement('span');
        bar.className = 'ebar';
        bar.style.width = d + 'px';
        elev.appendChild(bar);
      });
    }

    }
  }

  // ---- Reveal on scroll (with robust fallbacks) ----
  //
  // These run again after every client-side navigation, not just on first load.
  // Next.js swaps the contents of <main> without reloading the document, so a
  // one-shot querySelectorAll captured at load time knows nothing about the
  // markup of the page you just navigated to. Since .reveal starts at
  // `opacity: 0` and only becomes visible when this code adds `.in`, a stale
  // element list meant the new page rendered correctly and then sat there
  // invisible — which looks exactly like a page that failed to load, and comes
  // right on refresh because a refresh re-runs this file.
  //
  // Everything below is therefore idempotent and keyed off a data attribute,
  // so re-running only ever picks up elements that are new.
  function show(el) { el.classList.add('in'); }
  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.top < (window.innerHeight || 0) * 0.94 && r.bottom > 0;
  }
  function allReveals() { return [].slice.call(document.querySelectorAll('.reveal')); }
  function sweep() {
    allReveals().forEach(function (el) { if (!el.classList.contains('in') && inView(el)) show(el); });
  }

  var revealIO = 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { show(e.target); revealIO.unobserve(e.target); } });
      }, { threshold: 0, rootMargin: '0px 0px -6% 0px' })
    : null;

  function initReveals() {
    var fresh = allReveals().filter(function (el) { return !el.hasAttribute('data-ak-rv'); });
    fresh.forEach(function (el, i) {
      el.setAttribute('data-ak-rv', '1');
      el.style.transitionDelay = (Math.min(i % 4, 3) * 80) + 'ms';
      if (revealIO) revealIO.observe(el);
    });
    requestAnimationFrame(sweep);
    setTimeout(sweep, 250);
    // Belt and braces: never leave content invisible because an observer or a
    // transition misfired. Scoped to the elements present when this ran.
    setTimeout(function () { fresh.forEach(show); }, 1200);
    setTimeout(function () {
      fresh.forEach(function (el) {
        if (parseFloat(getComputedStyle(el).opacity) < 0.85) {
          el.style.transition = 'none'; el.style.opacity = '1'; el.style.transform = 'none';
        }
      });
      if (obj) [].slice.call(obj.children).forEach(function (d) {
        if (parseFloat(getComputedStyle(d).opacity) < 0.85) { d.style.animation = 'none'; d.style.opacity = '1'; }
      });
    }, 1700);
  }

  window.addEventListener('scroll', sweep, { passive: true });
  window.addEventListener('load', sweep);

  // ---- Animated counters: <span data-count="500" data-suffix="+"> ----
  function initCounters() {
    var els = [].slice.call(document.querySelectorAll('[data-count]'))
      .filter(function (el) { return !el.hasAttribute('data-ak-c'); });
    if (!els.length) return;
    els.forEach(function (el) { el.setAttribute('data-ak-c', '1'); });
    function animate(el) {
      var target = parseFloat(el.getAttribute('data-count')) || 0;
      var dur = 1600;
      var t0 = null;
      if (REDUCED) { el.textContent = target; return; }
      function frame(t) {
        if (!t0) t0 = t;
        var p = Math.min((t - t0) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased);
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
    if ('IntersectionObserver' in window) {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { animate(e.target); cio.unobserve(e.target); }
        });
      }, { threshold: 0.4 });
      els.forEach(function (el) { cio.observe(el); });
      setTimeout(function () { // safety: never leave a counter at 0
        els.forEach(function (el) {
          if (el.textContent === '0' || el.textContent === '') el.textContent = el.getAttribute('data-count');
        });
      }, 4000);
    } else {
      els.forEach(function (el) { el.textContent = el.getAttribute('data-count'); });
    }
  }

  // ---- Marquee: duplicate track content for a seamless loop ----
  function initMarquee() {
    [].slice.call(document.querySelectorAll('.marquee-track')).forEach(function (track) {
      if (track.hasAttribute('data-ak-mq')) return;   // or it doubles on every visit
      track.setAttribute('data-ak-mq', '1');
      track.innerHTML = track.innerHTML + track.innerHTML;
    });
  }

  // ---- Card pointer highlight (--mx follows the cursor) ----
  function initPointerEffects() {
    if (REDUCED || !window.matchMedia || !window.matchMedia('(hover: hover)').matches) return;
    [].slice.call(document.querySelectorAll('.card')).forEach(function (card) {
      if (card.hasAttribute('data-ak-ptr')) return;
      card.setAttribute('data-ak-ptr', '1');
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      });
    });

    // ---- Magnetic primary buttons (subtle pull toward cursor) ----
    [].slice.call(document.querySelectorAll('.btn-primary')).forEach(function (btn) {
      if (btn.hasAttribute('data-ak-mag')) return;
      btn.setAttribute('data-ak-mag', '1');
      var raf = null;
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          btn.style.transform = 'translate(' + (dx * 5) + 'px,' + (dy * 4 - 2) + 'px)';
        });
      });
      btn.addEventListener('pointerleave', function () {
        if (raf) cancelAnimationFrame(raf);
        btn.style.transform = '';
      });
    });
  }

  // ---- Parallax watermarks: [data-parallax="0.15"] ----
  var parallaxBound = false;
  function initParallax() {
    if (REDUCED) return;
    // Re-query on every call rather than closing over a snapshot, so the new
    // page's watermarks are included after a client-side navigation.
    function els() { return [].slice.call(document.querySelectorAll('[data-parallax]')); }
    var ticking = false;
    function update() {
      ticking = false;
      var vh = window.innerHeight || 1;
      els().forEach(function (el) {
        var f = parseFloat(el.getAttribute('data-parallax')) || 0.15;
        var r = el.getBoundingClientRect();
        var center = r.top + r.height / 2 - vh / 2;
        el.style.transform = 'translateY(' + (-center * f) + 'px)';
      });
    }
    if (!parallaxBound) {
      parallaxBound = true;   // one scroll listener, however many navigations
      window.addEventListener('scroll', function () {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
      }, { passive: true });
    }
    update();
  }

  // ---- i18n: English ⇄ Hindi (site-wide, persists) ----
  var mountLangSwitch = function () {};
  (function initI18N() {
    var DICT = window.AKARA_I18N || {};
    var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, OPTION: 0 };
    function walkText(node, fn) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { if (c.nodeValue && c.nodeValue.trim()) fn(c); }
        else if (c.nodeType === 1 && !SKIP[c.tagName] && !(c.classList && c.classList.contains('lang-switch'))) walkText(c, fn);
      }
    }
    function toHi() {
      walkText(document.body, function (t) {
        if (t.__en == null) t.__en = t.nodeValue;
        var key = t.__en.trim();
        var hi = DICT[key];
        if (hi != null) t.nodeValue = t.__en.replace(key, hi);
      });
      [].forEach.call(document.querySelectorAll('[placeholder]'), function (el) {
        if (el.__enPh == null) el.__enPh = el.getAttribute('placeholder');
        var hi = DICT[el.__enPh.trim()];
        if (hi != null) el.setAttribute('placeholder', hi);
      });
    }
    function toEn() {
      walkText(document.body, function (t) { if (t.__en != null) t.nodeValue = t.__en; });
      [].forEach.call(document.querySelectorAll('[placeholder]'), function (el) { if (el.__enPh != null) el.setAttribute('placeholder', el.__enPh); });
    }
    function setLang(lang) {
      document.documentElement.setAttribute('lang', lang);
      try { localStorage.setItem('akara-lang', lang); } catch (e) {}
      if (lang === 'hi') toHi(); else toEn();
      [].forEach.call(document.querySelectorAll('.lang-switch [data-lang]'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-lang') === lang);
        b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false');
      });
    }
    // Injected into the nav, so it disappears with the nav on a route change.
    mountLangSwitch = function () {
      var cta = document.querySelector('.nav-cta');
      if (!cta || cta.querySelector('.lang-switch')) return;
      var sw = document.createElement('div');
      sw.className = 'lang-switch';
      sw.setAttribute('role', 'group');
      sw.setAttribute('aria-label', 'Language / भाषा');
      sw.innerHTML = '<button type="button" data-lang="en">EN</button><button type="button" data-lang="hi">हिं</button>';
      cta.insertBefore(sw, cta.firstChild);
      sw.addEventListener('click', function (e) {
        var b = e.target.closest('[data-lang]');
        if (b) setLang(b.getAttribute('data-lang'));
      });
    };
    mountLangSwitch();

    var saved = 'en';
    try { saved = localStorage.getItem('akara-lang') || 'en'; } catch (e) {}
    setLang(saved);
    setTimeout(function () { if (document.documentElement.getAttribute('lang') === 'hi') toHi(); }, 400);
    window.akaraSetLang = setLang;
    window.akaraApplyLang = function () {
      var cur = 'en';
      try { cur = localStorage.getItem('akara-lang') || 'en'; } catch (e) {}
      setLang(cur);
    };
  })();

  /* ---- Page-scoped effects, re-runnable after client-side navigation ----
   *
   * The blocks above this point set up things that live in the layout — the
   * logo, the nav, the theme toggle, the WhatsApp button — and those survive a
   * route change, so they are initialised once.
   *
   * Everything in here belongs to the markup inside <main>, which Next.js
   * replaces wholesale when you follow a link without reloading the document.
   * Each function is idempotent, so calling this again only picks up elements
   * that weren't there before.
   */
  function pageInit() {
    // Layout-level: the nav is a React component, so moving between the
    // marketing site and the dashboard destroys and rebuilds it — taking the
    // theme toggle and language switch, which are injected into it, with it.
    initNav();
    mountThemeToggle();
    mountLangSwitch();

    // Page-level: everything inside <main>, which Next.js replaces on any
    // client-side navigation.
    initHero();
    initReveals();
    initCounters();
    initMarquee();
    initPointerEffects();
    initParallax();

    // Re-apply the translation pass to the markup that just arrived.
    if (window.akaraApplyLang) window.akaraApplyLang();
  }

  pageInit();
  window.akaraPageInit = pageInit;
})();
