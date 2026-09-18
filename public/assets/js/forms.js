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

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function rejectedHTML(data) {
    if (!data.filesRejected || !data.filesRejected.length) return "";
    return '<p style="margin-top:14px;font-size:13.5px;color:#D98A80">' +
      "We couldn't accept: " + esc(data.filesRejected.join(", ")) +
      ". Send those on WhatsApp and we'll attach them.</p>";
  }

  /* What the success screen offers once the address is settled: the tracking
     link for a guest, the dashboard for a member. */
  function doneHTML(data, email) {
    var html = "";
    if (data.trackingUrl && !data.hasAccount) {
      html += '<a class="btn btn-primary" href="' + data.trackingUrl + '">Track this request <span class="arr">→</span></a>' +
              '<a class="btn btn-ghost" href="/signup?email=' + encodeURIComponent(email) + '">Create an account</a>';
    } else if (data.reference) {
      html += '<a class="btn btn-primary" href="/dashboard/requests/' + esc(data.reference) + '">Open in your dashboard <span class="arr">→</span></a>';
    }
    return html;
  }

  /* The code step, for a guest whose address we haven't seen before.

     Written by hand rather than reusing the React CodeField because this
     screen is legacy markup rendered by the wizard scripts — there is no React
     tree here to mount into. The behaviour is deliberately the same: one
     input, auto-submit on the sixth digit, a resend on a visible countdown. */
  function verifyHTML(data) {
    return '' +
      '<div class="ak-verify" style="max-width:420px">' +
        '<p style="margin:0 0 4px;font-size:14.5px;line-height:1.6;color:var(--ink-soft)">' +
          "We've sent a six-digit code to <strong>" + esc(data.email) + "</strong>. " +
          "Enter it and we'll get started — until then we've held off on emailing you anything else." +
        '</p>' +
        '<div id="ak-verify-msg" role="alert" style="display:none;margin:10px 0 0;font-size:13.5px"></div>' +
        '<div style="display:flex;gap:10px;align-items:center;margin:14px 0 0">' +
          '<input id="ak-otp" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" ' +
            'autocomplete="one-time-code" placeholder="••••••" aria-label="Six-digit code from the email" ' +
            'style="flex:0 0 170px;font-size:22px;letter-spacing:.3em;text-align:center;padding:10px 12px">' +
          '<button type="button" id="ak-otp-go" class="btn btn-primary">Confirm</button>' +
        '</div>' +
        '<button type="button" id="ak-otp-resend" class="btn btn-ghost btn-sm" style="margin-top:12px">Resend in 60s</button>' +
      '</div>' +
      rejectedHTML(data);
  }

  function mountVerify(host, data, email) {
    host.innerHTML = verifyHTML(data);

    var input = host.querySelector("#ak-otp");
    var go = host.querySelector("#ak-otp-go");
    var resend = host.querySelector("#ak-otp-resend");
    var msg = host.querySelector("#ak-verify-msg");
    var busy = false;

    function say(text, bad) {
      msg.textContent = text || "";
      msg.style.display = text ? "block" : "none";
      msg.style.color = bad ? "#D98A80" : "var(--ink-soft)";
    }

    function countdown(seconds) {
      var left = seconds;
      resend.disabled = true;
      resend.textContent = "Resend in " + left + "s";
      var t = setInterval(function () {
        left -= 1;
        if (left <= 0) {
          clearInterval(t);
          resend.disabled = false;
          resend.textContent = "Send a new code";
        } else {
          resend.textContent = "Resend in " + left + "s";
        }
      }, 1000);
    }

    function submit() {
      var code = (input.value || "").replace(/\D/g, "");
      if (busy || code.length !== 6) return;
      busy = true;
      go.disabled = true;
      go.textContent = "Checking…";
      say("");

      fetch("/api/intake/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: email, code: code }),
        credentials: "same-origin"
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (body) {
            return { ok: r.ok, body: body };
          });
        })
        .then(function (res) {
          busy = false;
          go.disabled = false;
          go.textContent = "Confirm";
          if (!res.ok) {
            say((res.body && res.body.error) || "That code didn't work.", true);
            input.select();
            return;
          }
          /* Confirmed. Swap the code box for the same actions a verified
             submit would have shown in the first place. */
          host.innerHTML =
            '<p style="margin:0 0 14px;font-size:14.5px;color:var(--ink-soft)">' +
              "Email confirmed — we're on it. A copy is in your inbox." +
            "</p>" +
            doneHTML({ trackingUrl: res.body.trackingUrl, reference: res.body.reference, hasAccount: false }, email) +
            rejectedHTML(data);
        })
        .catch(function () {
          busy = false;
          go.disabled = false;
          go.textContent = "Confirm";
          say("We couldn't reach the server. Try again in a moment.", true);
        });
    }

    input.addEventListener("input", function () {
      var digits = (input.value || "").replace(/\D/g, "").slice(0, 6);
      if (input.value !== digits) input.value = digits;
      if (digits.length === 6) submit();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    });
    go.addEventListener("click", submit);

    resend.addEventListener("click", function () {
      if (resend.disabled) return;
      resend.disabled = true;
      fetch("/api/intake/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: email }),
        credentials: "same-origin"
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (body) {
            return { ok: r.ok, body: body };
          });
        })
        .then(function (res) {
          if (!res.ok) {
            say((res.body && res.body.error) || "We couldn't send another code.", true);
            resend.disabled = false;
            return;
          }
          say("A new code is on its way.");
          countdown((res.body && res.body.resendAfter) || 60);
        })
        .catch(function () {
          say("We couldn't reach the server. Try again in a moment.", true);
          resend.disabled = false;
        });
    });

    countdown(data.resendAfter || 60);
    try { input.focus(); } catch (e) { /* fine */ }
  }

  /* Called by the wizards after a successful submit so the success screen can
     either ask for the emailed code or offer the tracking link. Safe to ignore. */
  window.akaraAfterSubmit = function (data) {
    if (!data) return;
    var host = document.getElementById("post-submit-actions");
    if (!host) return;

    var email = "";
    try {
      var input = document.querySelector('input[name="email"]');
      email = input ? input.value.trim() : "";
    } catch (e) { /* fine */ }

    if (data.verification === "required") {
      mountVerify(host, data, data.email || email);
      return;
    }

    host.innerHTML = doneHTML(data, email) + rejectedHTML(data);
  };
})();
