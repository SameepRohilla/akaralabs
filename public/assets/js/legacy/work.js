/* work — page behaviour, re-runnable.
 *
 * Moved out of a next/script inline block. Inline scripts with
 * strategy="afterInteractive" execute on the initial document load and NOT on a
 * client-side navigation, so arriving at this page by following a link left its
 * behaviour completely unbound — the gallery count never rendered, filters did
 * nothing — and a refresh fixed it. That is what made it look like a rendering
 * bug rather than a script that never ran.
 *
 * Registered here instead, and called from shared.js's pageInit on every route
 * change. Element-level handlers are safe to re-bind because the markup is new
 * each time; anything attached to document or window is guarded, because those
 * survive navigation and would otherwise stack up one listener per visit.
 */
window.akaraPages = window.akaraPages || {};
window.akaraPages.work = function () {
  var btns = [].slice.call(document.querySelectorAll('.filter-btn'));
  var items = [].slice.call(document.querySelectorAll('.gitem'));
  var count = document.getElementById('count');
  var lastFilter = 'all';
  function word(n) {
    if (document.documentElement.getAttribute('lang') === 'hi') return 'प्रोजेक्ट';
    return n === 1 ? 'project' : 'projects';
  }
  function apply(f) {
    lastFilter = f;
    var n = 0;
    items.forEach(function (it) {
      var show = f === 'all' || it.dataset.cat === f;
      it.classList.toggle('hide', !show);
      if (show) n++;
    });
    if (count) count.textContent = n + ' ' + word(n);
  }
  btns.forEach(function (b) {
    b.addEventListener('click', function () {
      btns.forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      apply(b.dataset.filter);
    });
  });
  // Re-localise the count when the language switch is used.
  // On document, so it survives navigation — bind it once or every visit to
  // this page adds another copy.
  if (!window.__akaraWorkLangBound) {
    window.__akaraWorkLangBound = true;
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.lang-switch')) {
        setTimeout(function () {
          var active = document.querySelector('.filter-btn.active');
          var el = document.getElementById('count');
          if (!el) return;                       // not on the work page any more
          var f = active ? active.dataset.filter : 'all';
          var n = [].slice.call(document.querySelectorAll('.gitem'))
            .filter(function (it) { return f === 'all' || it.dataset.cat === f; }).length;
          var hi = document.documentElement.getAttribute('lang') === 'hi';
          el.textContent = n + ' ' + (hi ? 'प्रोजेक्ट' : (n === 1 ? 'project' : 'projects'));
        }, 0);
      }
    });
  }
  apply('all');
};
