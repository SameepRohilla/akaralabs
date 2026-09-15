/* faq — page behaviour, re-runnable.
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
window.akaraPages.faq = function () {
  // close siblings within a group when one opens
  var all = [].slice.call(document.querySelectorAll('.qa'));
  all.forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open) return;
      var group = d.closest('.faq-group');
      group.querySelectorAll('.qa[open]').forEach(function (o) { if (o !== d) o.open = false; });
    });
  });

  // scroll-spy
  var navLinks = [].slice.call(document.querySelectorAll('.faq-nav a'));

  /* The listener goes on window, which survives navigation, so it is bound
     once — but it must NOT close over the nav links found on this visit. After
     a route change those elements are detached and toggling classes on them
     does nothing visible. So the bound function re-queries each time it runs,
     and does nothing at all when the FAQ markup isn't on the page. */
  function spy() {
    var links = [].slice.call(document.querySelectorAll('.faq-nav a'));
    if (!links.length) return;
    var y = window.scrollY + 140;
    var idx = 0;
    links.forEach(function (a, i) {
      var g = document.querySelector(a.getAttribute('href'));
      if (g && g.offsetTop <= y) idx = i;
    });
    links.forEach(function (a, i) { a.classList.toggle('active', i === idx); });
  }

  if (!window.__akaraFaqSpyBound) {
    window.__akaraFaqSpyBound = true;
    window.addEventListener('scroll', spy, { passive: true });
  }
  spy();
  // smooth-scroll with offset (avoid scrollIntoView)
  navLinks.forEach(function (a) {
    a.addEventListener('click', function (e) {
      var t = document.querySelector(a.getAttribute('href'));
      if (!t) return;
      e.preventDefault();
      window.scrollTo({ top: t.offsetTop - 90, behavior: 'smooth' });
    });
  });
};
