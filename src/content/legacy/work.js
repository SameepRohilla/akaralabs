
/* gallery filtering */
(function () {
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
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.lang-switch')) setTimeout(function () { apply(lastFilter); }, 0);
  });
  apply('all');
})();
