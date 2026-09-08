
/* FAQ: single-open accordion + scroll-spy nav */
(function () {
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
  var groups = navLinks.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  function spy() {
    var y = window.scrollY + 140;
    var idx = 0;
    groups.forEach(function (g, i) { if (g && g.offsetTop <= y) idx = i; });
    navLinks.forEach(function (a, i) { a.classList.toggle('active', i === idx); });
  }
  window.addEventListener('scroll', spy, { passive: true });
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
})();
