// ============================================================
// anmeldung.js – Cockpit-App: Anmeldung mit Google (Google Identity Services) und Server-Aufrufe an die API (Api.js).
// App.html ruft window.COCKPIT_API(fn, args, fertig, fehler) – gleiche Funktionen wie früher über google.script.run.
// Das ID-Token (gültig 1 h) liegt nur auf diesem Gerät; abgelaufen → stille Neuanmeldung, sonst Anmeldeknopf.
// ============================================================
(function () {
  var K = window.COCKPIT_KONFIG || {};
  var SPEICHER = 'cockpit-anmeldung';
  var token = null, warte = [], gisBereit = false;

  function $(id) { return document.getElementById(id); }
  function gueltig(t) { return t && t.exp * 1000 > Date.now() + 60000; }
  function nutzlast(jwt) {
    var b = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(b).split('').map(function (c) { return '%' + ('0' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')));
  }
  try { var g = JSON.parse(localStorage.getItem(SPEICHER)); if (gueltig(g)) token = g; } catch (e) {}

  function zeige(text) {
    $('anmeldung').hidden = false;
    $('anmeldung-text').textContent = text || 'Bitte mit dem Google-Konto von Bachata Viersen anmelden.';
  }
  function vergiss() {
    token = null;
    try { localStorage.removeItem(SPEICHER); } catch (e) {}
  }
  function angemeldet(antwort) {
    try {
      var p = nutzlast(antwort.credential);
      token = { jwt: antwort.credential, exp: p.exp, email: p.email };
      try { localStorage.setItem(SPEICHER, JSON.stringify(token)); } catch (e) {}
    } catch (e) { return zeige('Anmeldung fehlgeschlagen – bitte noch einmal.'); }
    $('anmeldung').hidden = true;
    var w = warte; warte = [];
    w.forEach(function (f) { f(); });
  }
  function anmelden(text) {
    zeige(text);
    if (gisBereit) google.accounts.id.prompt();
  }
  function mitToken(f) {
    if (gueltig(token)) return f();
    vergiss();
    warte.push(f);
    if (warte.length === 1) anmelden();
  }

  // Server-Aufruf; bei abgelaufener Anmeldung einmal neu anmelden und wiederholen
  window.COCKPIT_API = function (fn, args, fertig, fehler, nochmal) {
    if (!K.api || !K.clientId) return fehler('Die App ist noch nicht fertig eingerichtet (API-Adresse oder Client-ID fehlt).');
    mitToken(function () {
      fetch(K.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: fn, args: args, idToken: token.jwt }) })
        .then(function (r) { if (!r.ok) throw new Error('Server nicht erreichbar (' + r.status + ').'); return r.json(); })
        .then(function (a) {
          if (a.ok) return fertig(a.daten);
          if (a.code === 'ANMELDUNG' && !nochmal) { vergiss(); return window.COCKPIT_API(fn, args, fertig, fehler, true); }
          if (a.code === 'KONTO') {
            // falsches Google-Konto: Konto wählen lassen, danach denselben Aufruf wiederholen
            vergiss();
            if (gisBereit) google.accounts.id.disableAutoSelect();
            warte.push(function () { window.COCKPIT_API(fn, args, fertig, fehler, true); });
            return anmelden(a.text + ' Bitte mit dem Bachata-Konto anmelden.');
          }
          fehler(a.text || 'Unbekannter Fehler.');
        })
        .catch(function (e) {
          // TypeError = Anfrage blockiert, meist Web-App nicht für „Jeder“ bereitgestellt oder falsche /exec-Adresse
          fehler(navigator.onLine === false ? 'Keine Internetverbindung.' : e instanceof TypeError ? 'Server nicht erreichbar – Bereitstellung der Cockpit-API prüfen.' : (e && e.message || e));
        });
    });
  };

  // Google Identity Services nachladen
  if (!K.clientId) return;
  var s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.onload = function () {
    google.accounts.id.initialize({ client_id: K.clientId, callback: angemeldet, auto_select: true, use_fedcm_for_prompt: true, cancel_on_tap_outside: false });
    google.accounts.id.renderButton($('anmeldung-knopf'), { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'de' });
    gisBereit = true;
    if (warte.length) google.accounts.id.prompt();
  };
  s.onerror = function () { zeige('Google-Anmeldung konnte nicht geladen werden – Internetverbindung prüfen.'); };
  document.head.appendChild(s);
})();
