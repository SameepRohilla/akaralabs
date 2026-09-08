/* ============================================================
   AKARA LABS — form submission
   ------------------------------------------------------------
   Posts to our own /api/intake instead of a third-party form
   relay. That means: the enquiry becomes a tracked request with
   a reference, files land on our server (no 5 MB email cap),
   and the customer can follow progress at /track/ or in their
   dashboard.

   The wizard scripts on /start and /print call window.akaraSubmit
   exactly as before — only the transport underneath changed.
   ============================================================ */
window.AKARA_FORM = {
  endpoint: "/api/intake",
  whatsapp: "https://wa.me/917082089049",
  email: "hello@akaralabs.in"
};

(function () {
  var CFG = window.AKARA_FORM;

  /* Which wizard are we on? The two forms send different field sets and the
     server needs to know which shape to expect. */
  function formKind() {
    var p = (window.location.pathname || "").toLowerCase();
    if (p.indexOf("/print") === 0 || p.indexOf("print") > -1) return "print";
    return "project";
  }

  /* Campaign attribution, if the visitor arrived with any. */
  function utm() {
    var out = {};
    try {
      var q = new URLSearchParams(window.location.search);
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"].forEach(
        function (k) { var v = q.get(k); if (v) out[k] = v.slice(0, 120); }
      );
      if (document.referrer && document.referrer.indexOf(window.location.host) === -1) {
        out.referrer = document.referrer.slice(0, 200);
      }
    } catch (e) { /* older browser — attribution is optional */ }
    return out;
  }

  /* Submit fields (+ optional File[] attachments).
     Resolves with { reference, trackingUrl, hasAccount, filesRejected }
     and rejects on a real failure so the wizard can show its fallback. */
  window.akaraSubmit = function (fields, files) {
    var payload = {
      form: formKind(),
      fields: {},
      utm: utm()
    };

    Object.keys(fields || {}).forEach(function (k) {
      if (k === "_subject") return;               // server writes its own subjects
      var v = fields[k];
      if (v === undefined || v === null) return;
      payload.fields[k] = String(v);
    });

    var fd = new FormData();
    fd.append("payload", JSON.stringify(payload));
    fd.append("_gotcha", "");                      // honeypot, left empty by humans
    (files || []).forEach(function (f) { fd.append("files", f, f.name); });

    return fetch(CFG.endpoint, {
      method: "POST",
      headers: { Accept: "application/json" },     // no Content-Type — the browser sets the boundary
      body: fd,
      credentials: "same-origin"                   // so a signed-in customer's request is attached to them
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok || !data.ok) {
            var err = new Error((data && data.error) || "send failed (" + r.status + ")");
            err.status = r.status;
            throw err;
          }
          return data;
        });
      })
      .catch(function (err) {
        console.error("[Akara form] submit failed:", (err && err.message) || err);
        throw err;
      });
  };

  /* Shown when the network send fails outright. */
  window.akaraFallbackHTML = function () {
    return 'We couldn\'t send that just now. Please message us on ' +
      '<a href="' + CFG.whatsapp + '" style="color:var(--terra-deep);border-bottom:1px solid var(--line-2)">WhatsApp</a>' +
      ' or email <a href="mailto:' + CFG.email + '" style="color:var(--terra-deep);border-bottom:1px solid var(--line-2)">' + CFG.email + '</a> — sorry about that.';
  };

  /* Called by the wizards after a successful submit so the success screen can
     offer the tracking link and an account. Safe to ignore. */
  window.akaraAfterSubmit = function (data) {
    if (!data) return;
    var host = document.getElementById("post-submit-actions");
    if (!host) return;

    var email = "";
    try {
      var input = document.querySelector('input[name="email"]');
      email = input ? encodeURIComponent(input.value.trim()) : "";
    } catch (e) { /* fine */ }

    var html = '';
    if (data.trackingUrl && !data.hasAccount) {
      html += '<a class="btn btn-primary" href="' + data.trackingUrl + '">Track this request <span class="arr">→</span></a>' +
              '<a class="btn btn-ghost" href="/signup?email=' + email + '">Create an account</a>';
    } else if (data.reference) {
      html += '<a class="btn btn-primary" href="/dashboard/requests/' + data.reference + '">Open in your dashboard <span class="arr">→</span></a>';
    }
    if (data.filesRejected && data.filesRejected.length) {
      html += '<p style="margin-top:14px;font-size:13.5px;color:#D98A80">' +
              'We couldn\'t accept: ' + data.filesRejected.join(", ") +
              '. Send those on WhatsApp and we\'ll attach them.</p>';
    }
    host.innerHTML = html;
  };
})();
