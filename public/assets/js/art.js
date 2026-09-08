/* ============================================================
   AKARA LABS — blueprint illustration set
   Technical line-art stand-ins for product photography.
   Swap these for real photos when you have them: replace the
   .ph[data-art] block's contents with <img>, or drop an
   <image-slot> in. Until then these read as engineering drawings.
   ============================================================ */
(function () {
  // Theme-aware: strokes follow the active palette (dark ⇄ light)
  var I = 'var(--indigo)';   // indigo line
  var A = 'var(--terra)';    // saffron accent
  var F = 'none';
  // helper: wrap inner svg markup
  function svg(inner, vb) {
    return '<svg class="art" viewBox="' + (vb || '0 0 400 300') + '" fill="none" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }
  var dash = 'style="stroke:' + I + '" stroke-width="1" stroke-dasharray="3 5" opacity="0.5"';
  var line = 'style="stroke:' + I + '" stroke-width="1.6"';
  var thin = 'style="stroke:' + I + '" stroke-width="1.1" opacity="0.8"';
  var acc  = 'style="stroke:' + A + '" stroke-width="1.8"';

  var ART = {
    /* top-down quadcopter X-frame */
    quadframe: svg(
      '<line x1="200" y1="20" x2="200" y2="280" ' + dash + '/>' +
      '<line x1="40" y1="150" x2="360" y2="150" ' + dash + '/>' +
      // arms
      '<path d="M150 110 L80 70 M250 110 L320 70 M150 190 L80 230 M250 190 L320 230" ' + line + '/>' +
      // centre plate
      '<rect x="150" y="110" width="100" height="80" rx="8" ' + line + '/>' +
      '<rect x="168" y="128" width="64" height="44" rx="4" ' + thin + '/>' +
      // motor mounts + prop circles
      '<circle cx="80" cy="70" r="20" ' + line + '/><circle cx="80" cy="70" r="9" ' + thin + '/>' +
      '<circle cx="320" cy="70" r="20" ' + line + '/><circle cx="320" cy="70" r="9" ' + thin + '/>' +
      '<circle cx="80" cy="230" r="20" ' + line + '/><circle cx="80" cy="230" r="9" ' + thin + '/>' +
      '<circle cx="320" cy="230" r="20" ' + line + '/><circle cx="320" cy="230" r="9" ' + acc + '/>' +
      '<circle cx="80" cy="70" r="44" ' + dash + '/><circle cx="320" cy="70" r="44" ' + dash + '/>' +
      '<circle cx="80" cy="230" r="44" ' + dash + '/><circle cx="320" cy="230" r="44" ' + dash + '/>'
    ),
    /* adaptive gripper, front */
    gripper: svg(
      '<line x1="200" y1="30" x2="200" y2="270" ' + dash + '/>' +
      '<rect x="160" y="50" width="80" height="46" rx="6" ' + line + '/>' +
      '<rect x="178" y="60" width="44" height="10" rx="3" ' + thin + '/>' +
      '<circle cx="172" cy="110" r="9" ' + line + '/><circle cx="228" cy="110" r="9" ' + line + '/>' +
      '<path d="M172 110 C 150 150, 150 200, 178 250" ' + line + '/>' +
      '<path d="M228 110 C 250 150, 250 200, 222 250" ' + line + '/>' +
      '<path d="M186 118 C 172 155, 172 198, 190 238" ' + thin + '/>' +
      '<path d="M214 118 C 228 155, 228 198, 210 238" ' + thin + '/>' +
      '<circle cx="200" cy="250" r="16" ' + acc + '/>'
    ),
    /* IoT sensor enclosure, front 3/4 */
    enclosure: svg(
      '<rect x="120" y="80" width="160" height="150" rx="12" ' + line + '/>' +
      '<rect x="120" y="80" width="160" height="34" rx="12" ' + thin + '/>' +
      '<line x1="150" y1="150" x2="250" y2="150" ' + thin + '/>' +
      '<line x1="150" y1="166" x2="250" y2="166" ' + thin + '/>' +
      '<line x1="150" y1="182" x2="250" y2="182" ' + thin + '/>' +
      '<circle cx="200" cy="210" r="7" ' + thin + '/>' +
      '<circle cx="158" cy="97" r="5" ' + acc + '/>' +
      // mounting tabs
      '<path d="M120 110 L100 110 L100 130 L120 130" ' + thin + '/><circle cx="108" cy="120" r="4" ' + thin + '/>' +
      '<path d="M280 110 L300 110 L300 130 L280 130" ' + thin + '/><circle cx="292" cy="120" r="4" ' + thin + '/>' +
      '<line x1="200" y1="40" x2="200" y2="76" ' + dash + '/>'
    ),
    /* turbine impeller, top */
    impeller: svg(
      '<circle cx="200" cy="150" r="110" ' + dash + '/>' +
      '<g ' + line + '>' +
      '<path d="M200 150 C 230 120, 270 110, 300 100"/>' +
      '<path d="M200 150 C 234 165, 270 195, 288 222"/>' +
      '<path d="M200 150 C 195 188, 175 230, 150 252"/>' +
      '<path d="M200 150 C 165 168, 120 178, 92 170"/>' +
      '<path d="M200 150 C 175 118, 150 80, 150 50"/>' +
      '<path d="M200 150 C 168 140, 130 110, 112 84"/>' +
      '<path d="M200 150 C 235 138, 278 142, 305 158"/>' +
      '<path d="M200 150 C 208 188, 235 222, 268 238"/>' +
      '</g>' +
      '<circle cx="200" cy="150" r="34" ' + line + '/>' +
      '<circle cx="200" cy="150" r="15" ' + acc + '/>'
    ),
    /* optics housing, side elevation */
    optics: svg(
      '<line x1="40" y1="150" x2="360" y2="150" ' + dash + '/>' +
      '<rect x="120" y="98" width="170" height="104" rx="14" ' + line + '/>' +
      '<circle cx="120" cy="150" r="52" ' + line + '/>' +
      '<circle cx="120" cy="150" r="38" ' + thin + '/>' +
      '<circle cx="120" cy="150" r="22" ' + acc + '/>' +
      '<path d="M150 202 L150 230 L260 230 L260 202" ' + thin + '/>' +
      '<circle cx="175" cy="230" r="5" ' + thin + '/><circle cx="235" cy="230" r="5" ' + thin + '/>' +
      '<line x1="300" y1="120" x2="300" y2="180" ' + thin + '/>'
    ),
    /* founders' award — turned form (echoes hero) */
    award: svg(
      '<line x1="200" y1="20" x2="200" y2="280" ' + dash + '/>' +
      '<path d="M165 250 L235 250 L228 232 L172 232 Z" ' + line + '/>' +
      '<rect x="176" y="206" width="48" height="26" ' + line + '/>' +
      '<path d="M188 206 L184 120 Q 200 92 216 120 L212 206 Z" ' + line + '/>' +
      '<path d="M184 120 Q 200 150 216 120" ' + thin + '/>' +
      '<ellipse cx="200" cy="80" rx="22" ry="26" ' + line + '/>' +
      '<line x1="180" y1="218" x2="220" y2="218" ' + acc + '/>'
    ),
    /* conveyor guide bracket — L bracket iso */
    bracket: svg(
      '<path d="M120 90 L120 220 L280 220 L280 196 L146 196 L146 90 Z" ' + line + '/>' +
      '<path d="M120 90 L150 70 L150 196" ' + thin + '/>' +
      '<path d="M146 196 L176 176 L300 176 L280 196" ' + thin + '/>' +
      '<path d="M280 196 L300 176 L300 200 L280 220 Z" ' + thin + '/>' +
      '<circle cx="133" cy="120" r="7" ' + thin + '/><circle cx="133" cy="165" r="7" ' + thin + '/>' +
      '<circle cx="210" cy="208" r="7" ' + acc + '/><circle cx="255" cy="208" r="7" ' + thin + '/>' +
      '<path d="M146 196 L120 220" ' + line + '/>'
    ),
    /* LoRa gateway housing */
    gateway: svg(
      '<rect x="130" y="110" width="140" height="130" rx="10" ' + line + '/>' +
      '<line x1="155" y1="140" x2="245" y2="140" ' + thin + '/>' +
      '<line x1="155" y1="156" x2="245" y2="156" ' + thin + '/>' +
      '<rect x="160" y="186" width="80" height="34" rx="4" ' + thin + '/>' +
      '<line x1="210" y1="110" x2="210" y2="56" ' + line + '/>' +
      '<ellipse cx="210" cy="50" rx="9" ry="14" ' + acc + '/>' +
      '<path d="M150 240 L150 258 L180 258" ' + thin + '/>' +
      '<path d="M250 240 L250 258 L220 258" ' + thin + '/>'
    ),
    /* FPV camera mount */
    camera: svg(
      '<rect x="120" y="220" width="160" height="20" rx="4" ' + line + '/>' +
      '<line x1="150" y1="230" x2="170" y2="230" ' + thin + '/><line x1="230" y1="230" x2="250" y2="230" ' + thin + '/>' +
      '<path d="M200 220 C 188 180, 150 170, 158 120" ' + line + '/>' +
      '<path d="M200 220 C 212 180, 250 170, 242 120" ' + line + '/>' +
      '<rect x="158" y="86" width="84" height="44" rx="8" ' + line + '/>' +
      '<circle cx="200" cy="108" r="15" ' + acc + '/><circle cx="200" cy="108" r="7" ' + thin + '/>'
    ),
    /* robot arm joint housing — flange face */
    joint: svg(
      '<circle cx="200" cy="150" r="96" ' + line + '/>' +
      '<circle cx="200" cy="150" r="60" ' + thin + '/>' +
      '<circle cx="200" cy="150" r="34" ' + line + '/>' +
      '<circle cx="200" cy="150" r="16" ' + acc + '/>' +
      '<g ' + thin + '><circle cx="200" cy="74" r="6"/><circle cx="276" cy="150" r="6"/>' +
      '<circle cx="200" cy="226" r="6"/><circle cx="124" cy="150" r="6"/>' +
      '<circle cx="254" cy="96" r="6"/><circle cx="254" cy="204" r="6"/>' +
      '<circle cx="146" cy="204" r="6"/><circle cx="146" cy="96" r="6"/></g>' +
      '<path d="M192 116 L208 116 L204 128 L196 128 Z" ' + thin + '/>'
    ),
    /* wedding favour — small diya / lamp keepsake (Indian touch) */
    favour: svg(
      '<line x1="200" y1="60" x2="200" y2="250" ' + dash + '/>' +
      '<path d="M120 180 Q 200 150 280 180 Q 270 215 200 222 Q 130 215 120 180 Z" ' + line + '/>' +
      '<path d="M255 176 Q 280 150 268 128 Q 256 150 244 168" ' + line + '/>' +
      '<path d="M262 150 Q 266 138 262 128" ' + acc + '/>' +
      '<ellipse cx="200" cy="182" rx="62" ry="12" ' + thin + '/>' +
      '<path d="M150 232 Q 200 244 250 232" ' + thin + '/>'
    ),
    /* architectural massing model — isometric blocks */
    massing: svg(
      '<path d="M90 210 L200 260 L310 210 L200 162 Z" ' + thin + '/>' +
      // tall block
      '<path d="M150 188 L150 120 L195 100 L195 168 Z" ' + line + '/>' +
      '<path d="M195 168 L195 100 L240 120 L240 188 Z" ' + line + '/>' +
      '<path d="M150 120 L195 100 L240 120 L195 140 Z" ' + line + '/>' +
      // low block
      '<path d="M205 200 L205 168 L245 150 L245 182 Z" ' + thin + '/>' +
      '<path d="M245 182 L245 150 L282 168 L282 200 Z" ' + thin + '/>' +
      '<path d="M205 168 L245 150 L282 168 L242 186 Z" ' + acc + '/>'
    )
  };
  // exploded view reuses the quadframe with offset annotation
  ART.exploded = ART.quadframe;

  function inject() {
    document.querySelectorAll('.ph[data-art]').forEach(function (ph) {
      if (ph.__artDone) return;
      var key = ph.getAttribute('data-art');
      var markup = ART[key];
      if (!markup) return;
      ph.insertAdjacentHTML('afterbegin', markup);
      ph.classList.add('has-art');
      ph.__artDone = true;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
  window.akaraInjectArt = inject;
})();
