/*
 * Atlas Mutuelle (démo locale) : étude tarifaire en 4 étapes sur une seule page (sans rechargement), puis
 * proposition affichée sur la même page. Les réponses ne quittent jamais la page (rien dans l'URL, rien d'envoyé) ;
 * elles servent uniquement à calculer un tarif fictif, avec une formule propre à Atlas (au mois d'abord).
 */
(function () {
  var form = document.getElementById('atl-etude');
  if (!form) return;

  var steps = Array.prototype.slice.call(form.querySelectorAll('.atl-etape'));
  var progress = document.querySelector('.atl-progress');
  var milestones = Array.prototype.slice.call(document.querySelectorAll('.atl-jalons li'));
  var current = 0;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var shown = function (el) { return !el.closest('[hidden]'); };

  // ── Listes jour / année de la date de naissance ────────────────────────────
  var day = form.elements['cnd_naissance_jour'];
  var year = form.elements['cnd_naissance_annee'];
  for (var d = 1; d <= 31; d++) day.add(new Option(String(d), String(d)));
  for (var y = new Date().getFullYear() - 17; y >= 1930; y--) year.add(new Option(String(y), String(y)));

  // ── Boutons radio dessinés (Oui / Non) ─────────────────────────────────────
  each(form.querySelectorAll('[role="radiogroup"]'), function (group) {
    var radios = group.querySelectorAll('[role="radio"]');
    var pick = function (radio) {
      each(radios, function (r) {
        r.setAttribute('aria-checked', String(r === radio));
        r.setAttribute('tabindex', r === radio ? '0' : '-1');
      });
      group.removeAttribute('aria-invalid');
      // « Actuellement assuré(e) ? » Oui : la compagnie actuelle est demandée.
      if (group.getAttribute('data-champ') === 'hist_assure') {
        document.getElementById('atl-bloc-assureur').hidden = radio.getAttribute('data-value') !== 'oui';
      }
    };
    each(radios, function (radio) {
      radio.addEventListener('click', function () { pick(radio); });
      radio.addEventListener('keydown', function (event) {
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); pick(radio); }
      });
    });
  });

  // ── Boutons bascule (type de véhicule) ─────────────────────────────────────
  each(form.querySelectorAll('.atl-bascule'), function (group) {
    var buttons = group.querySelectorAll('button[aria-pressed]');
    each(buttons, function (button) {
      button.addEventListener('click', function () {
        each(buttons, function (b) { b.setAttribute('aria-pressed', String(b === button)); });
        group.removeAttribute('aria-invalid');
      });
    });
  });

  // ── Liste déroulante maison (compagnie actuelle) ───────────────────────────
  each(form.querySelectorAll('button[aria-haspopup="listbox"]'), function (button) {
    var list = document.getElementById(button.getAttribute('aria-controls'));
    var open = function (state) {
      list.hidden = !state;
      button.setAttribute('aria-expanded', String(state));
    };
    button.addEventListener('click', function () { open(list.hidden); });
    list.addEventListener('click', function (event) {
      var option = event.target.closest('[role="option"]');
      if (!option) return;
      button.textContent = option.textContent.trim();
      button.setAttribute('data-value', option.textContent.trim());
      open(false);
    });
    document.body.addEventListener('click', function (event) {
      if (!list.hidden && !button.contains(event.target) && !list.contains(event.target)) open(false);
    });
  });

  // ── Navigation entre les étapes ────────────────────────────────────────────
  function problems(step) {
    var bad = [];
    each(step.querySelectorAll('input[required], select[required]'), function (el) {
      if (!shown(el)) return;
      var ok = el.checkValidity();
      if (ok) el.removeAttribute('aria-invalid'); else el.setAttribute('aria-invalid', 'true');
      if (!ok && !(el.type === 'radio' && bad.some(function (b) { return b.name === el.name; }))) bad.push(el);
    });
    each(step.querySelectorAll('[role="radiogroup"][aria-required="true"]'), function (group) {
      if (shown(group) && !group.querySelector('[aria-checked="true"]')) { group.setAttribute('aria-invalid', 'true'); bad.push(group); }
    });
    each(step.querySelectorAll('.atl-bascule[data-obligatoire]'), function (group) {
      if (shown(group) && !group.querySelector('[aria-pressed="true"]')) { group.setAttribute('aria-invalid', 'true'); bad.push(group); }
    });
    var message = step.querySelector('.atl-erreur');
    message.hidden = bad.length === 0;
    message.textContent = bad.length ? 'Merci de compléter les ' + bad.length + ' information(s) signalée(s) en rouge.' : '';
    return bad;
  }

  function show(index) {
    current = index;
    steps.forEach(function (step, i) { step.hidden = i !== index; });
    milestones.forEach(function (li, i) {
      li.className = i < index ? 'is-done' : i === index ? 'is-current' : '';
    });
    progress.setAttribute('aria-valuenow', String(index + 1));
    progress.setAttribute('aria-valuetext', milestones[index].textContent);
    progress.querySelector('.atl-progress-bar').style.width = ((index + 1) * 25) + '%';
    var first = steps[index].querySelector('input, select, [role="radio"], button');
    if (first && first.focus) first.focus();
  }

  form.addEventListener('click', function (event) {
    var button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.getAttribute('data-action') === 'precedent') return show(Math.max(0, current - 1));
    if (problems(steps[current]).length) return;
    // Petit temps de chargement entre deux étapes, comme un vrai extranet.
    form.setAttribute('aria-busy', 'true');
    setTimeout(function () {
      form.removeAttribute('aria-busy');
      show(Math.min(steps.length - 1, current + 1));
    }, 250);
  });

  // ── Calcul du tarif (dernière étape) ───────────────────────────────────────
  var text = function (name) { var el = form.elements[name]; return el ? String(el.value || '').trim() : ''; };
  var checked = function (name) { var el = form.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; };
  var two = function (n) { return ('0' + n).slice(-2); };

  function answers() {
    var assure = form.querySelector('[data-champ="hist_assure"] [aria-checked="true"]');
    var genre = form.querySelector('.atl-bascule [aria-pressed="true"]');
    return {
      assure: assure ? assure.getAttribute('data-value') : '',
      compagnie: document.getElementById('atl-assureur').getAttribute('data-value'),
      crm: text('hist_coef'),
      sinistres: text('hist_nb_sin'),
      resilie: !!form.querySelector('input[name="hist_resilie"]:checked'),
      suspension: !!form.querySelector('input[name="hist_suspension"]:checked'),
      condNom: text('cnd_nom'),
      condPrenom: text('cnd_prenom'),
      condNaissance: text('cnd_naissance_annee') && text('cnd_naissance_mois') && text('cnd_naissance_jour')
        ? text('cnd_naissance_annee') + '-' + two(text('cnd_naissance_mois')) + '-' + two(text('cnd_naissance_jour')) : '',
      permis: text('cnd_permis'),
      typePermis: checked('cnd_type_permis'),
      csp: text('cnd_csp'),
      genre: genre ? genre.textContent.trim() : '',
      plaque: text('veh_plaque'),
      marque: text('veh_marque'),
      modele: text('veh_modele'),
      mec: text('veh_mec'),
      cv: text('veh_cv'),
      valeur: text('veh_valeur'),
      usage: text('veh_usage'),
      nuit: text('veh_nuit'),
      nom: text('sou_nom'),
      prenom: text('sou_prenom'),
      naissance: text('sou_naissance')
    };
  }

  function tarif(a) {
    var now = new Date();
    var years = function (iso, fallback) {
      var t = Date.parse(iso || '');
      return Number.isNaN(t) ? fallback : (now.getTime() - t) / (365.25 * 24 * 3600 * 1000);
    };
    var age = years(a.condNaissance, 40);
    var licence = years(a.permis ? a.permis + '-01' : '', 15);
    var claims = Number(a.sinistres) || 0;
    var value = Number(a.valeur) || 12000;
    var monthly = 31;
    if (age < 23) monthly += 28; else if (age < 26) monthly += 15; else if (age > 75) monthly += 10;
    if (licence < 2) monthly += 20; else if (licence < 5) monthly += 8;
    monthly += claims * 9;
    if (value > 25000) monthly += 12; else if (value > 15000) monthly += 6;
    if ((Number(a.cv) || 5) > 8) monthly += 7;
    if (a.usage === 'U2') monthly += 4;
    if (a.usage === 'U3') monthly += 11;
    if (a.nuit === 'V') monthly += 5;
    if (a.nuit === 'G') monthly -= 3;
    if (a.assure === 'non') monthly += 6;
    if (a.genre === 'Utilitaire') monthly *= 1.15;
    if (a.genre === 'Deux-roues') monthly *= 0.8;
    if (a.resilie) monthly *= 1.4;
    if (a.suspension) monthly *= 1.25;
    monthly = Math.round(monthly * (Number(a.crm) || 1) * 100) / 100;
    // Paiement comptant : 4 % de moins que douze mensualités.
    var annual = Math.round(monthly * 12 * 0.96 * 100) / 100;
    var hash = 0;
    JSON.stringify(a).split('').forEach(function (c) { hash = (hash * 37 + c.charCodeAt(0)) % 100000; });
    return {
      monthly: monthly,
      annual: annual,
      franchise: claims >= 2 ? 400 : 200,
      numero: 'ATL-' + now.getFullYear() + '-' + ('0000' + hash).slice(-5)
    };
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (problems(steps[current]).length) return;
    var a = answers();
    var t = tarif(a);
    var fmt = function (n) { return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; };
    document.getElementById('atl-parcours').hidden = true;
    var wait = document.getElementById('atl-attente');
    wait.hidden = false;
    setTimeout(function () {
      wait.hidden = true;
      document.getElementById('atl-mensuel').textContent = fmt(t.monthly);
      document.getElementById('atl-annuel').textContent = fmt(t.annual);
      document.getElementById('atl-franchise').textContent = t.franchise + ' €';
      document.getElementById('atl-numero').textContent = t.numero;
      document.getElementById('atl-recap').textContent =
        'Étude réalisée pour ' + a.prenom + ' ' + a.nom + (a.marque ? ' — ' + a.marque + ' ' + a.modele : '') + '.';
      document.getElementById('atl-resultat').hidden = false;
    }, 900);
  });
})();
