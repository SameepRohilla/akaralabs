/* ============================================================
   AKARA LABS — analytics loader
   ------------------------------------------------------------
   Paste your real IDs below. Any ID left as a placeholder
   (X's) is simply skipped, so this file is safe to ship as-is.

   Where to get them:
   · GA4_ID     — analytics.google.com → Admin → Data streams
                  (looks like  G-AB12CD34EF)
   · GTM_ID     — tagmanager.google.com → your container
                  (looks like  GTM-AB12CD3)
   · CLARITY_ID — clarity.microsoft.com → project → Settings
                  (looks like  abc1def2gh)

   Tip: if you use GTM, you can leave GA4 and Clarity blank
   here and add them as tags inside GTM instead — one or the
   other, not both, or you'll double-count visits.
   ============================================================ */
window.AKARA_IDS = {
  GA4_ID:     'G-1LM2PR2QH5',
  GTM_ID:     'GT-TNCS4S9F',
  CLARITY_ID: 'x4rbe4hvf3'
};

(function () {
  var ids = window.AKARA_IDS;
  function unset(v) { return !v || /X{4,}/i.test(v); }

  /* ---- Google Tag Manager ---- */
  if (!unset(ids.GTM_ID)) {
    (function (w, d, s, l, i) {
      w[l] = w[l] || [];
      w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      var f = d.getElementsByTagName(s)[0], j = d.createElement(s);
      j.async = true;
      j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + (l !== 'dataLayer' ? '&l=' + l : '');
      f.parentNode.insertBefore(j, f);
    })(window, document, 'script', 'dataLayer', ids.GTM_ID);
  }

  /* ---- Google Analytics 4 ---- */
  if (!unset(ids.GA4_ID)) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ids.GA4_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', ids.GA4_ID, { anonymize_ip: true });
  }

  /* ---- Microsoft Clarity ---- */
  if (!unset(ids.CLARITY_ID)) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1;
      t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', ids.CLARITY_ID);
  }

  /* ---- Useful conversion events (no-ops until GA4 is live) ---- */
  function track(name, params) {
    if (window.gtag) window.gtag('event', name, params || {});
    if (window.dataLayer && unset(ids.GA4_ID)) window.dataLayer.push({ event: name });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('wa.me') !== -1) track('whatsapp_click', { location: a.className || 'link' });
    if (href.indexOf('mailto:') === 0) track('email_click');
  });
  window.akaraTrack = track; // available for form-success hooks
})();
