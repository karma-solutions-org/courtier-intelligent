/*
 * Démo type Zephir (locale) : application d'une seule page qui imite le DOM d'une application Angular Material
 * (groupes `mat-button-toggle-group`, boutons `aria-pressed`, classes ng-invalid / ng-valid, « Suivant » refusé tant
 * qu'une question obligatoire est sans réponse). Les pages reprennent la structure relevée sur l'extranet réel
 * (src/engine/extranets/zephir/fixture.ts).
 * Les réponses restent dans le sessionStorage de l'onglet (jamais dans l'URL, jamais envoyées nulle part) ; la page de
 * tarif s'en sert pour calculer une prime fictive.
 */
(function () {
  var KEY = 'zephir-projet-auto';
  /** Délai de « chargement » d'une page après « Suivant », comme une application Angular qui interroge son serveur. */
  var LOAD_MS = 350;

  function load() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function save(data) {
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* stockage indisponible : la démo continue */ }
  }

  var form = document.getElementById('zp-form');
  if (!form) return; // accueil : rien à faire

  // ── Gabarits des pages (structure de l'extranet réel) ───────────────────────

  /** Groupe Oui / Non tel que Zephir l'écrit : question au-dessus du bloc qui contient le groupe, obligatoire (ng-invalid). */
  function toggle(name, question) {
    return '<div class="form-input"><label><span>' + question + '</span></label>' +
      '<div class="form-input"><mat-button-toggle-group role="group" required="" zcontrol="" class="mat-button-toggle-group ng-untouched ng-pristine ng-invalid">' +
      '<mat-button-toggle value="true" class="mat-button-toggle"><button type="button" class="mat-button-toggle-button" aria-pressed="false" name="' + name + '"><span class="mat-button-toggle-label-content"><span>Oui</span></span></button></mat-button-toggle>' +
      '<mat-button-toggle value="false" class="mat-button-toggle"><button type="button" class="mat-button-toggle-button" aria-pressed="false" name="' + name + '"><span class="mat-button-toggle-label-content"><span>Non</span></span></button></mat-button-toggle>' +
      '</mat-button-toggle-group><app-control-error></app-control-error></div></div>';
  }

  /** Champ texte Material (ngModel, sans formcontrolname). */
  function input(id, name, label, placeholder) {
    return '<div class="form-input"><label for="' + id + '">' + label + '</label><input id="' + id + '" name="' + name + '" type="text"' +
      (placeholder ? ' placeholder="' + placeholder + '"' : '') + ' class="mat-input-element ng-untouched ng-pristine ng-valid" /></div>';
  }

  var DECLARATIONS = {
    permis: 'Les conducteurs désignés disposent-ils d’un permis de conduire en cours de validité et reconnu en France donnant droit à son titulaire de conduire un véhicule ?',
    incompatible: 'L’un des conducteurs désignés se trouve-il dans une situation légalement incompatible avec le maintien ou la délivrance du permis de conduire, notamment celle relative à son état de santé ?',
    transport: 'Le véhicule est-il utilisé pour le transport de matières dangereuses, pour le transport public de voyageurs ou de marchandises, taxis, auto-école, ambulance ou véhicule donné en location ?'
  };

  /** Antécédents d'un conducteur. Les deux conducteurs ont la MÊME page (même titre, mêmes champs) : piège de l'extranet réel. */
  var ANTECEDENTS =
    '<h3>Antécédents de Monsieur MARTIN PAUL</h3>' +
    input('bm', 'bonusMalus', 'Bonus-malus', '1,00') +
    toggle('ASSURE', 'Assuré actuellement') +
    toggle('RESILIE', 'Résilié par un précédent assureur') +
    '<h5>Veuillez déclarer les sinistres survenus sur les 36 derniers mois</h5>' +
    '<table class="mat-table"><thead><tr><th>Numéro de sinistre</th><th>Date de survenance</th><th>Type de sinistre</th><th>Taux de responsabilité</th></tr></thead><tbody></tbody></table>' +
    '<div class="btnAjoutTable"><span style="margin-right: 5px;">Ajouter un sinistre</span><svg class="svg-inline--fa fa-circle-plus" role="img" viewBox="0 0 512 512"><path d="M256 0a256 256 0 1 1 0 512 256 256 0 1 1 0-512zm-24 368a24 24 0 0 0 48 0v-88h88a24 24 0 0 0 0-48h-88v-88a24 24 0 0 0-48 0v88h-88a24 24 0 0 0 0 48h88z"></path></svg></div>';

  /** Ligne de sinistre ajoutée par « Ajouter un sinistre ». */
  function claimRow(n) {
    return '<tr>' +
      '<td>Sinistre ' + n + '</td>' +
      '<td><input name="dateSurvenance' + n + '" type="text" placeholder="jj/mm/aaaa" /></td>' +
      '<td><select name="typeSinistre' + n + '"><option value=""></option><option value="MAT">Matériel</option><option value="CORP">Corporel</option><option value="BDG">Bris de glace</option><option value="VOL">Vol</option></select></td>' +
      '<td><select name="tauxResp' + n + '"><option value=""></option><option value="0">0 %</option><option value="50">50 %</option><option value="100">100 %</option></select></td>' +
      '</tr>';
  }

  var PAGES = [
    {
      name: 'vehicule',
      fil: 'Véhicule',
      html: function () {
        return '<h3>Informations complémentaires</h3>' +
          input('immat', 'immatriculation', 'Immatriculation', 'AA-123-AA') +
          input('marque', 'marque', 'Marque') +
          input('modele', 'modele', 'Modèle') +
          '<div class="form-input"><label for="dmec">Date de mise en circulation</label><input id="dmec" name="dateMec" type="text" placeholder="jj/mm/aaaa" class="mat-input-element ng-untouched ng-pristine ng-valid" /></div>' +
          '<div class="form-input"><label for="cp">Code postal du lieu de stationnement</label><input id="cp" name="cpStationnement" type="text" class="mat-input-element ng-untouched ng-pristine ng-valid" /></div>' +
          '<div class="form-input"><label for="ville">Ville du lieu de stationnement</label><input id="ville" name="villeStationnement" type="text" class="mat-input-element ng-untouched ng-pristine ng-valid" /></div>' +
          toggle('GARAGE', 'Garage') +
          // « Remorque / Caravane » déjà répondu, juste avant la liste de la classe socio-professionnelle (comme sur l'extranet réel).
          '<div class="form-input"><div><span>Remorque / Caravane :</span>' +
          '<mat-button-toggle-group role="group" class="ng-valid"><button type="button" aria-pressed="true">- de 750kg</button><button type="button" aria-pressed="false">+ de 750kg</button></mat-button-toggle-group></div>' +
          '<div><select name="csp"><option value="">Classe socio-professionnelle</option><option>Salarié sédentaire</option><option>Salarié non sédentaire</option><option>Cadre</option><option>Artisan sédentaire</option><option>Commerçant</option><option>Fonctionnaire</option><option>Retraité</option><option>Étudiant</option><option>Sans profession</option></select></div></div>';
      }
    },
    { name: 'antecedents-principal', fil: 'Conducteur principal', html: function () { return ANTECEDENTS; } },
    { name: 'antecedents-secondaire', fil: 'Conducteur secondaire', html: function () { return ANTECEDENTS; } },
    {
      name: 'resume',
      fil: 'Résumé',
      html: function () {
        var d = load();
        var vehicule = [d.marque, d.modele].filter(Boolean).join(' ') || 'véhicule non renseigné';
        return '<h3>Résumé</h3>' +
          '<p>Conducteur Principal : Monsieur MARTIN PAUL</p>' +
          '<p>Conducteur Secondaire : Monsieur MARTIN PAUL</p>' +
          '<p>Véhicule : ' + escapeHtml(vehicule) + (d.immatriculation ? ' (' + escapeHtml(d.immatriculation) + ')' : '') + '</p>';
      }
    },
    {
      name: 'declarations',
      fil: 'Déclarations',
      html: function () {
        return '<h3>Déclarations complémentaires</h3>' + toggle('AUTO01', DECLARATIONS.permis) + toggle('AUTO02', DECLARATIONS.incompatible) + toggle('AUTO03', DECLARATIONS.transport);
      }
    },
    { name: 'tarif', fil: 'Tarif', html: tarifHtml }
  ];

  var NEXT = '<div class="actions"><button type="button" class="boutonAbandon">Abandonner</button><button type="button" class="boutonSubmit"><span class="mat-button-wrapper"> Suivant </span></button></div>';

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  // ── Affichage d'une page ───────────────────────────────────────────────────

  var index = 0;

  function render() {
    var page = PAGES[index];
    form.innerHTML = page.html() + (index < PAGES.length - 1 ? NEXT : '');
    form.setAttribute('data-page', page.name);
    var fil = document.getElementById('zp-fil');
    if (fil) {
      fil.innerHTML = PAGES.map(function (p, i) { return '<span' + (i === index ? ' class="actif"' : '') + '>' + p.fil + '</span>'; }).join('');
    }
    majSynthese();
    if (index === PAGES.length - 1) calculerTarif();
  }

  // ── Volet « Synthèse » (présent sur toutes les pages, il parle de « sinistre ») ─

  function majSynthese() {
    var d = load();
    var vehicule = document.getElementById('zp-syn-vehicule');
    if (vehicule) vehicule.textContent = 'Véhicule : ' + ([d.marque, d.modele].filter(Boolean).join(' ') || 'à renseigner');
    var stationnement = document.getElementById('zp-syn-stationnement');
    if (stationnement) stationnement.textContent = 'Stationnement : ' + ([d.cpStationnement, d.villeStationnement].filter(Boolean).join(' ') || 'à renseigner');
    var sinistres = document.getElementById('zp-syn-sinistres');
    if (sinistres) {
      var count = ((d.principal && d.principal.sinistres) || []).length + ((d.secondaire && d.secondaire.sinistres) || []).length +
        form.querySelectorAll('tbody tr').length;
      sinistres.textContent = count ? count + ' sinistre(s) déclaré(s)' : 'Aucun sinistre déclaré';
    }
  }

  // ── Réponses de la page affichée ───────────────────────────────────────────

  function value(name) {
    var el = form.querySelector('[name="' + name + '"]:not(button)');
    return el ? String(el.value || '').trim() : '';
  }
  function pressed(name) {
    var button = form.querySelector('button[name="' + name + '"][aria-pressed="true"]');
    return button ? button.textContent.trim() : '';
  }

  function enregistrer(page) {
    var d = load();
    if (page === 'vehicule') {
      ['immatriculation', 'marque', 'modele', 'dateMec', 'cpStationnement', 'villeStationnement', 'csp'].forEach(function (name) { d[name] = value(name); });
      d.garage = pressed('GARAGE');
      var remorque = form.querySelector('mat-button-toggle-group:not([required]) button[aria-pressed="true"]');
      d.remorque = remorque ? remorque.textContent.trim() : '';
    }
    if (page === 'antecedents-principal' || page === 'antecedents-secondaire') {
      var rows = Array.prototype.map.call(form.querySelectorAll('tbody tr'), function (row, i) {
        var n = i + 1;
        return { date: value('dateSurvenance' + n), type: value('typeSinistre' + n), taux: value('tauxResp' + n) };
      });
      d[page === 'antecedents-principal' ? 'principal' : 'secondaire'] = { bonusMalus: value('bonusMalus'), assure: pressed('ASSURE'), resilie: pressed('RESILIE'), sinistres: rows };
    }
    if (page === 'declarations') {
      d.declarations = { permis: pressed('AUTO01'), incompatible: pressed('AUTO02'), transport: pressed('AUTO03') };
    }
    save(d);
  }

  // ── Comportements « Angular Material » ─────────────────────────────────────

  function marquerErreurs(groups) {
    Array.prototype.forEach.call(groups, function (group) {
      group.classList.remove('ng-untouched');
      group.classList.add('ng-touched');
      var error = group.parentElement && group.parentElement.querySelector('app-control-error');
      if (error) error.textContent = 'Réponse obligatoire';
    });
    var alerte = form.querySelector('.zp-alerte');
    if (!alerte) {
      alerte = document.createElement('div');
      alerte.className = 'zp-alerte';
      alerte.setAttribute('role', 'alert');
      form.insertBefore(alerte, form.firstChild);
    }
    alerte.textContent = 'Veuillez répondre aux questions obligatoires avant de continuer.';
  }

  function suivant() {
    // Comme Zephir : « Suivant » refusé tant qu'un groupe Oui / Non obligatoire est sans réponse.
    var unanswered = form.querySelectorAll('mat-button-toggle-group[required].ng-invalid');
    if (unanswered.length) {
      marquerErreurs(unanswered);
      return;
    }
    enregistrer(PAGES[index].name);
    var chargement = document.getElementById('zp-chargement');
    if (chargement) chargement.hidden = false;
    setTimeout(function () {
      index = Math.min(index + 1, PAGES.length - 1);
      render();
      if (chargement) chargement.hidden = true;
      document.documentElement.scrollTop = 0;
    }, LOAD_MS);
  }

  document.body.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    // Bouton bascule : un seul enfoncé par groupe, le groupe devient valide.
    var button = target.closest('button[aria-pressed]');
    var group = button && button.closest('mat-button-toggle-group');
    if (button && group) {
      Array.prototype.forEach.call(group.querySelectorAll('button[aria-pressed]'), function (b) {
        b.setAttribute('aria-pressed', String(b === button));
        var wrapper = b.closest('mat-button-toggle');
        if (wrapper) wrapper.classList.toggle('mat-button-toggle-checked', b === button);
      });
      group.classList.remove('ng-invalid', 'ng-pristine', 'ng-untouched');
      group.classList.add('ng-valid', 'ng-dirty', 'ng-touched');
      var error = group.parentElement && group.parentElement.querySelector('app-control-error');
      if (error) error.textContent = '';
      var alerte = form.querySelector('.zp-alerte');
      if (alerte && !form.querySelector('mat-button-toggle-group[required].ng-invalid')) alerte.parentNode.removeChild(alerte);
      return;
    }
    // « Ajouter un sinistre » : une ligne de plus dans le tableau de la page.
    if (target.closest('.btnAjoutTable')) {
      var body = form.querySelector('tbody');
      if (body) body.insertAdjacentHTML('beforeend', claimRow(body.rows.length + 1));
      majSynthese();
      return;
    }
    if (target.closest('.boutonSubmit')) {
      event.preventDefault();
      suivant();
      return;
    }
    if (target.closest('.boutonAbandon')) {
      try { sessionStorage.removeItem(KEY); } catch (e) { /* rien */ }
      window.location.href = 'index.html';
    }
  });

  // Saisie : classes ngModel (pristine → dirty, untouched → touched).
  function dirty(event) {
    var el = event.target;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
      el.classList.remove('ng-pristine');
      el.classList.add('ng-dirty');
    }
  }
  form.addEventListener('input', dirty);
  form.addEventListener('change', dirty);
  form.addEventListener('focusout', function (event) {
    var el = event.target;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
      el.classList.remove('ng-untouched');
      el.classList.add('ng-touched');
    }
  });

  // ── Page de tarif : prime fictive calculée à partir des réponses ───────────

  function tarifHtml() {
    return '<h1>Votre tarif Auto</h1>' +
      '<p class="recap" id="zp-recap">Projet établi pour Monsieur MARTIN PAUL.</p>' +
      '<p>Devis n° <span id="zp-numero">ZD-2026-000000</span> · valable 30 jours · formule Tous Risques Confort</p>' +
      '<div class="price-box"><span>Prime annuelle TTC</span><strong class="price" id="zp-annuelle">0,00 €</strong><span>soit</span><strong id="zp-mensuelle">0,00 € / mois</strong></div>' +
      '<p>Franchise générale : <span id="zp-franchise">300 €</span></p>' +
      '<h2>Vos garanties</h2>' +
      '<table><thead><tr><th>Garantie</th><th>Incluse</th><th>Plafond</th><th>Franchise</th></tr></thead><tbody>' +
      '<tr><td>Responsabilité civile</td><td class="incluse">Incluse</td><td>Illimité</td><td>—</td></tr>' +
      '<tr><td>Défense pénale et recours</td><td class="incluse">Incluse</td><td>10 000 €</td><td>—</td></tr>' +
      '<tr><td>Vol</td><td class="incluse">Incluse</td><td>20 000 €</td><td>300 €</td></tr>' +
      '<tr><td>Incendie</td><td class="incluse">Incluse</td><td>20 000 €</td><td>300 €</td></tr>' +
      '<tr><td>Bris de glace</td><td class="incluse">Incluse</td><td>—</td><td>100 €</td></tr>' +
      '<tr><td>Dommages tous accidents</td><td class="incluse">Incluse</td><td>—</td><td>500 €</td></tr>' +
      '<tr><td>Assistance 0 km</td><td class="non-incluse">En option</td><td>—</td><td>—</td></tr>' +
      '</tbody></table>' +
      '<h2>Exclusions principales</h2>' +
      '<ul><li>Conduite sans permis valide</li><li>Conduite sous l’emprise d’un état alcoolique ou de stupéfiants</li><li>Usure et pannes mécaniques</li></ul>' +
      '<div class="actions"><button type="button" class="boutonAbandon">Nouveau projet</button><span></span></div>';
  }

  /** Date « jj/mm/aaaa » ou « aaaa-mm-jj » → horodatage, ou NaN. */
  function parseDate(text) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text || '');
    if (m) return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return Date.parse(text || '');
  }

  function fmt(n) {
    var parts = n.toFixed(2).split('.');
    return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + parts[1] + ' €';
  }

  function calculerTarif() {
    var d = load();
    var now = new Date();
    var age = (now.getTime() - parseDate(d.dateMec)) / (365.25 * 24 * 3600 * 1000);
    var vehicleAge = Number.isNaN(age) ? 6 : age;
    var principal = d.principal || {};
    var secondaire = d.secondaire || {};
    var crm = Number(String(principal.bonusMalus || '').replace(',', '.')) || 1;
    var claims = (principal.sinistres || []).concat(secondaire.sinistres || []);

    var premium = 480 + (vehicleAge <= 5 ? 160 : vehicleAge <= 10 ? 90 : 40);
    claims.forEach(function (c) {
      premium += 90 + (c.type === 'CORP' ? 80 : 0) + (Number(c.taux) || 0) * 1.2;
    });
    if (/^(13|75|93|94|92|69)/.test(d.cpStationnement || '')) premium *= 1.15;
    if (d.garage === 'Oui') premium *= 0.93;
    if (principal.assure === 'Non') premium *= 1.1;
    if (principal.resilie === 'Oui') premium *= 1.45;
    if (d.declarations && d.declarations.transport === 'Oui') premium *= 1.6;
    premium = Math.round(premium * crm * 100) / 100;
    // Paiement mensuel : 4 % de frais de fractionnement.
    var monthly = Math.round((premium * 1.04 / 12) * 100) / 100;

    document.getElementById('zp-annuelle').textContent = fmt(premium);
    document.getElementById('zp-mensuelle').textContent = fmt(monthly) + ' / mois';
    var franchise = document.getElementById('zp-franchise');
    if (franchise) franchise.textContent = claims.length >= 2 ? '600 €' : '300 €';
    var hash = 0;
    JSON.stringify(d).split('').forEach(function (c) { hash = (hash * 31 + c.charCodeAt(0)) % 1000000; });
    document.getElementById('zp-numero').textContent = 'ZD-' + now.getFullYear() + '-' + ('00000' + hash).slice(-6);
    var recap = document.getElementById('zp-recap');
    if (recap && (d.marque || d.immatriculation)) {
      recap.textContent = 'Projet établi pour Monsieur MARTIN PAUL — ' + [d.marque, d.modele].filter(Boolean).join(' ') + (d.immatriculation ? ' (' + d.immatriculation + ')' : '') + '.';
    }
  }

  // Nouveau projet : on repart d'une page vide.
  try { sessionStorage.removeItem(KEY); } catch (e) { /* rien */ }
  render();
})();
