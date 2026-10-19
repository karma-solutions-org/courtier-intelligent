/*
 * Maison Sûre (démo locale) : second extranet habitation, pour le comparatif. Mêmes questions qu'Assureur Habitat,
 * mais un autre calcul de tarif (base plus basse, surface plus chère, sinistres plus pénalisés).
 * Les réponses restent dans le sessionStorage de l'onglet (jamais dans l'URL, jamais envoyées nulle part) ;
 * la page de résultat s'en sert pour calculer un tarif fictif.
 */
(function () {
  var KEY = 'maison-sure-devis';
  function load() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function save(data) {
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* stockage indisponible : la démo continue */ }
  }

  var form = document.querySelector('form[data-next]');
  if (form) {
    var data = load();
    // Réaffiche les réponses déjà saisies (retour à l'étape précédente).
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || !(el.name in data)) return;
      if (el.type === 'radio') el.checked = el.value === data[el.name];
      else el.value = data[el.name];
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      var answers = load();
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name) return;
        if (el.type === 'radio') { if (el.checked) answers[el.name] = el.value; }
        else answers[el.name] = el.value;
      });
      save(answers);
      var button = form.querySelector('button[type="submit"]');
      if (button) { button.disabled = true; button.textContent = 'Chargement…'; }
      setTimeout(function () { window.location.href = form.getAttribute('data-next'); }, form.hasAttribute('data-final') ? 900 : 200);
    });
  }

  // Page de résultat : tarif fictif calculé à partir des réponses.
  var annual = document.getElementById('prime-annuelle');
  if (annual) {
    var d = load();
    if (Object.keys(d).length > 0) {
      var premium = 95 + (Number(d.surfaceHabitable) || 60) * 1.7 + (Number(d.capitalMobilier) || 15000) * 0.003;
      premium += (Number(d.objetsValeur) || 0) * 0.008 + (Number(d.sinistresHabitation) || 0) * 85;
      if (d.typeLogement === 'maison') premium *= 1.18;
      if (d.residencePrincipale === 'non') premium *= 1.25;
      if (d.piscine === 'oui') premium += 30;
      if (d.alarme === 'oui') premium *= 0.88;
      if (d.resilieHabitation === 'oui') premium *= 1.45;
      premium = Math.round(premium * 100) / 100;
      var fmt = function (n) { return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; };
      annual.textContent = fmt(premium);
      document.getElementById('prime-mensuelle').textContent = fmt(Math.round((premium / 12) * 100) / 100);
      var recap = document.getElementById('recap');
      if (recap && d.nom) {
        recap.textContent = 'Devis établi pour ' + (d.prenom || '') + ' ' + d.nom + (d.typeLogement ? ' — ' + d.typeLogement + ' de ' + (d.surfaceHabitable || '?') + ' m²' : '') + '.';
      }
    }
    var restart = document.getElementById('nouveau-devis');
    if (restart) restart.addEventListener('click', function () { try { sessionStorage.removeItem(KEY); } catch (e) {} });
  }
})();
