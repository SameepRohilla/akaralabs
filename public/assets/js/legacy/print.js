/* print — page behaviour, re-runnable.
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
window.akaraPages.print = function () {
  var form = document.getElementById('printForm');

  // ---- collapsible sections (minimized by default) ----
  [].slice.call(document.querySelectorAll('.fsec-head')).forEach(function (head) {
    head.addEventListener('click', function () {
      var sec = head.closest('.fsec');
      var open = sec.hasAttribute('data-open');
      if (open) { sec.removeAttribute('data-open'); head.setAttribute('aria-expanded', 'false'); }
      else { sec.setAttribute('data-open', ''); head.setAttribute('aria-expanded', 'true'); }
    });
  });
  // Mark a section "touched" once the user interacts with anything inside it.
  [].slice.call(document.querySelectorAll('.fsec')).forEach(function (sec) {
    var mark = function () { sec.classList.add('touched'); };
    sec.querySelectorAll('input, textarea, select').forEach(function (el) {
      el.addEventListener('change', mark);
      if (el.type === 'text' || el.type === 'email' || el.type === 'tel' || el.tagName === 'TEXTAREA') el.addEventListener('input', mark);
    });
  });
  function openSection(el) {
    var sec = el.closest('.fsec');
    if (sec && !sec.hasAttribute('data-open')) {
      sec.setAttribute('data-open', '');
      var h = sec.querySelector('.fsec-head'); if (h) h.setAttribute('aria-expanded', 'true');
    }
  }

  // ---- file dropzone ----
  var dz = document.getElementById('dropzone');
  var fi = document.getElementById('fileinput');
  var dzfiles = document.getElementById('dzfiles');
  var files = [];
  dz.addEventListener('click', function(){ fi.click(); });
  ['dragenter','dragover'].forEach(function(e){ dz.addEventListener(e, function(ev){ ev.preventDefault(); dz.classList.add('drag'); }); });
  ['dragleave','drop'].forEach(function(e){ dz.addEventListener(e, function(ev){ ev.preventDefault(); dz.classList.remove('drag'); }); });
  dz.addEventListener('drop', function(ev){ addFiles(ev.dataTransfer.files); });
  fi.addEventListener('change', function(){ addFiles(fi.files); });
  function fmt(b){ return b<1024?b+' B':b<1048576?(b/1024).toFixed(0)+' KB':(b/1048576).toFixed(1)+' MB'; }
  function addFiles(list){ [].slice.call(list).forEach(function(f){ files.push(f); }); renderFiles(); }
  function renderFiles(){
    dzfiles.innerHTML = '';
    files.forEach(function(f, i){
      var row = document.createElement('div');
      row.className = 'dz-file';
      row.innerHTML = '<span aria-hidden="true">▤</span><span>'+f.name+'</span><span style="opacity:.6">'+fmt(f.size)+'</span><button type="button" class="x" aria-label="Remove">×</button>';
      row.querySelector('.x').addEventListener('click', function(e){ e.stopPropagation(); files.splice(i,1); renderFiles(); });
      dzfiles.appendChild(row);
    });
  }

  // ---- quantity stepper ----
  var qtyInput = document.getElementById('qtyInput');
  var qtyUnit = document.getElementById('qtyUnit');
  function clampQty() {
    var v = parseInt(qtyInput.value, 10);
    if (isNaN(v) || v < 1) v = 1;
    qtyInput.value = v;
    qtyUnit.textContent = v === 1 ? 'piece' : 'pieces';
  }
  document.getElementById('qtyMinus').addEventListener('click', function(){ qtyInput.value = (parseInt(qtyInput.value,10)||1) - 1; clampQty(); });
  document.getElementById('qtyPlus').addEventListener('click', function(){ qtyInput.value = (parseInt(qtyInput.value,10)||0) + 1; clampQty(); });
  qtyInput.addEventListener('input', clampQty);
  qtyInput.addEventListener('blur', clampQty);
  clampQty();

  // ---- date: no past dates; flexible toggle disables the picker ----
  var needDate = document.getElementById('needDate');
  var flexChk = document.getElementById('flexChk');
  var today = new Date(); var iso = today.toISOString().split('T')[0];
  needDate.min = iso;
  flexChk.addEventListener('change', function(){
    needDate.disabled = flexChk.checked;
    needDate.style.opacity = flexChk.checked ? '0.45' : '';
    if (flexChk.checked) needDate.value = '';
  });
  needDate.addEventListener('input', function(){ if (needDate.value) { flexChk.checked = false; needDate.disabled = false; needDate.style.opacity=''; } });

  // ---- validation + submit ----
  function flash(el){
    openSection(el);
    el.style.borderColor = 'var(--terra-deep)';
    el.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--terra) 22%, transparent)';
    el.focus({ preventScroll: true });
    var top = el.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({ top: top, behavior: 'smooth' });
    el.addEventListener('input', function clr(){ el.style.borderColor=''; el.style.boxShadow=''; el.removeEventListener('input', clr); });
  }
  var submitBtn = document.getElementById('submitBtn');
  submitBtn.addEventListener('click', function () {
    var name = form.name.value.trim();
    var email = form.email.value.trim();
    if (!name) { flash(form.name); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { flash(form.email); return; }

    var errEl = document.getElementById('formError');
    errEl.style.display = 'none';
    var origHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.6';
    submitBtn.innerHTML = 'Sending…';

    // Gather everything the user entered.
    function picked(n){ return [].slice.call(form.querySelectorAll('[name="'+n+'"]:checked')).map(function(x){return x.value;}).join(', '); }
    function val(n){ return form[n] ? (form[n].value || '').trim() : ''; }
    var ref = 'AKR-P-' + String(Math.floor(100000 + Math.random()*900000));
    var fields = {
      _subject: '3D-print request — ' + name + ' (' + ref + ')',
      Reference: ref,
      Name: name,
      Email: email,
      Company: val('company') || '—',
      WhatsApp: val('phone') || '—',
      Material: picked('material') || 'Recommend',
      Quality: picked('quality') || 'Recommend',
      Strength: picked('infill') || 'Recommend',
      Size: val('size') || '—',
      Colour: val('colour') || '—',
      Finishing: picked('finish') || 'As printed',
      Quantity: val('qty'),
      'Needed by': (document.getElementById('flexChk') && document.getElementById('flexChk').checked) ? 'Flexible' : (val('timeline') || '—'),
      Description: val('brief') || '—',
      Files: files.length ? files.map(function(f){return f.name;}).join(', ') : 'none attached'
    };

    window.akaraSubmit(fields, files).then(function (data) {
      if (data && data.reference) ref = data.reference;
      if (window.akaraAfterSubmit) window.akaraAfterSubmit(data);
      if (window.akaraTrack) window.akaraTrack('print_request_submitted', { material: fields.Material });
      form.style.display = 'none';
      document.getElementById('psuccess').classList.add('show');
      document.getElementById('refno').textContent = 'REF · ' + ref;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function () {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '';
      submitBtn.innerHTML = origHTML;
      errEl.innerHTML = window.akaraFallbackHTML();
      errEl.style.display = 'block';
    });
  });
};
