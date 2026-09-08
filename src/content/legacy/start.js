
(function () {
  var steps = [].slice.call(document.querySelectorAll('.step'));
  var psteps = [].slice.call(document.querySelectorAll('.pstep'));
  var nextBtn = document.getElementById('nextBtn');
  var backBtn = document.getElementById('backBtn');
  var stepCount = document.getElementById('stepCount');
  var form = document.getElementById('intake');
  var cur = 0;
  var total = steps.length;

  function pad(n){ return n < 10 ? '0'+n : ''+n; }

  function render() {
    steps.forEach(function (s, i) { s.classList.toggle('active', i === cur); });
    psteps.forEach(function (p, i) {
      p.classList.toggle('active', i === cur);
      p.classList.toggle('done', i < cur);
    });
    backBtn.hidden = cur === 0;
    stepCount.textContent = 'Step ' + pad(cur+1) + ' / ' + pad(total);
    nextBtn.innerHTML = cur === total - 1
      ? 'Send it <span class="arr">→</span>'
      : 'Continue <span class="arr">→</span>';
    if (cur === total - 1) buildReview();
  }

  function valid() {
    if (cur === 3) {
      var name = form.name.value.trim();
      var email = form.email.value.trim();
      if (!name) { flash(form.name); return false; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { flash(form.email); return false; }
    }
    return true;
  }
  function flash(el) {
    el.style.borderColor = 'var(--terra-deep)';
    el.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--terra) 22%, transparent)';
    el.focus();
    el.addEventListener('input', function clr(){ el.style.borderColor=''; el.style.boxShadow=''; el.removeEventListener('input', clr); });
  }

  nextBtn.addEventListener('click', function () {
    if (!valid()) return;
    if (cur < total - 1) { cur++; render(); window.scrollTo(0,0); }
    else submit();
  });
  backBtn.addEventListener('click', function () { if (cur>0){ cur--; render(); } });

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
  function addFiles(list){
    [].slice.call(list).forEach(function(f){ files.push(f); });
    renderFiles();
  }
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

  // ---- review ----
  function getMulti(name){ return [].slice.call(form.querySelectorAll('input[name="'+name+'"]:checked')).map(function(x){return x.value;}); }
  function val(name){ var el = form[name]; return el ? el.value.trim() : ''; }
  function buildReview() {
    var rev = document.getElementById('review');
    var service = (form.querySelector('input[name="service"]:checked')||{}).value || '—';
    var fields = getMulti('fields'); 
    var rows = [
      ['Service', service],
      ['Field', fields.length ? fields.join(', ') : '<span class="muted2">not specified</span>'],
      ['Project', val('project') || '<span class="muted2">untitled</span>'],
      ['Brief', val('brief') || '<span class="muted2">— add a description for a sharper quote</span>'],
      ['Files', files.length ? files.length + ' attached' : '<span class="muted2">none</span>'],
      ['Quantity', val('qty') || '<span class="muted2">to discuss</span>'],
      ['Timeline', val('timeline') || '<span class="muted2">flexible</span>'],
      ['Contact', (val('name')||'—') + (val('company')? ' · '+val('company'):'') + '<br>' + (val('email')||'—') + (val('phone')? ' · '+val('phone'):'')]
    ];
    rev.innerHTML = rows.map(function(r){
      return '<div class="review-row"><div class="rk">'+r[0]+'</div><div class="rv">'+r[1]+'</div></div>';
    }).join('');
  }

  function submit() {
    var ref = 'AKR-' + String(Math.floor(100000 + Math.random()*900000));
    var service = (form.querySelector('input[name="service"]:checked')||{}).value || '—';
    var fields = {
      _subject: 'New project enquiry — ' + (val('name')||'someone') + ' (' + ref + ')',
      Reference: ref,
      Service: service,
      Field: getMulti('fields').join(', ') || 'not specified',
      'Project name': val('project') || 'untitled',
      Brief: val('brief') || '—',
      Quantity: val('qty') || 'to discuss',
      Timeline: val('timeline') || 'flexible',
      Name: val('name'),
      Company: val('company') || '—',
      Email: val('email'),
      Phone: val('phone') || '—',
      Files: files.length ? files.map(function(f){return f.name;}).join(', ') : 'none attached'
    };

    var errEl = document.getElementById('startError');
    errEl.style.display = 'none';
    var orig = nextBtn.innerHTML;
    nextBtn.disabled = true; nextBtn.style.opacity = '0.6';
    nextBtn.innerHTML = 'Sending…';

    window.akaraSubmit(fields, files).then(function (data) {
      if (data && data.reference) ref = data.reference;
      if (window.akaraAfterSubmit) window.akaraAfterSubmit(data);
      if (window.akaraTrack) window.akaraTrack('project_enquiry_submitted', { service: service });
      document.getElementById('progress').style.display = 'none';
      form.style.display = 'none';
      document.getElementById('success').classList.add('show');
      document.getElementById('refno').textContent = 'REF · ' + ref;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function () {
      nextBtn.disabled = false; nextBtn.style.opacity = '';
      nextBtn.innerHTML = orig;
      errEl.innerHTML = window.akaraFallbackHTML();
      errEl.style.display = 'block';
    });
  }

  render();
})();
