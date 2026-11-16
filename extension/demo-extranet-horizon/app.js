/*
 * Horizon Assurances (démo locale) : projet auto sur une seule page, puis page « Votre cotisation ».
 * Les réponses restent dans le sessionStorage de l'onglet (jamais dans l'URL, jamais envoyées nulle part) ;
 * la page de cotisation s'en sert pour calculer un tarif fictif, avec une formule propre à Horizon.
 */
(function () {
  var KEY = 'horizon-projet-auto';
  function load() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function save(data) {
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* stockage indisponible : la démo continue */ }
  }

  // ── Volets repliables (tous ouverts au chargement) ─────────────────────────
  Array.prototype.forEach.call(document.querySelectorAll('.acc-toggle'), function (toggle) {
    toggle.addEventListener('click', function () {
      var body = document.getElementById(toggle.getAttribute('aria-controls'));
      var open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      if (body) body.hidden = !open;
    });
  });

  // ── Liste déroulante maison (lieu de garage) ───────────────────────────────
  Array.prototype.forEach.call(document.querySelectorAll('[role="combobox"]'), function (combo) {
    var list = document.getElementById(combo.getAttribute('aria-controls'));
    if (!list) return;
    function open(state) {
      list.hidden = !state;
      combo.setAttribute('aria-expanded', String(state));
    }
    function choose(option) {
      Array.prototype.forEach.call(list.querySelectorAll('[role="option"]'), function (item) {
        item.setAttribute('aria-selected', String(item === option));
      });
      combo.textContent = option.textContent.trim();
      combo.setAttribute('data-value', option.getAttribute('data-code'));
      combo.removeAttribute('aria-invalid');
      open(false);
      combo.dispatchEvent(new Event('change', { bubbles: true }));
    }
    combo.addEventListener('click', function () { open(list.hidden); });
    combo.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') { event.preventDefault(); open(true); }
      if (event.key === 'Escape') open(false);
    });
    list.addEventListener('click', function (event) {
      var option = event.target.closest('[role="option"]');
      if (option) choose(option);
    });
    document.body.addEventListener('click', function (event) {
      if (!list.hidden && !combo.contains(event.target) && !list.contains(event.target)) open(false);
    });
  });

  // ── Projet auto : validation, enregistrement des réponses, calcul ──────────
  var form = document.getElementById('hz-projet');
  if (form) {
    var iso = function (d, m, y) {
      if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(y)) return '';
      return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
    };
    var val = function (name) {
      var el = form.elements[name];
      if (!el) return '';
      if (el.length !== undefined && el.tagName !== 'SELECT') {
        var checked = Array.prototype.filter.call(el, function (r) { return r.checked; })[0];
        return checked ? checked.value : '';
      }
      return String(el.value || '').trim();
    };
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var combos = Array.prototype.slice.call(form.querySelectorAll('[role="combobox"][aria-required="true"]'));
      var missingCombo = combos.filter(function (c) { return !c.getAttribute('data-value'); });
      missingCombo.forEach(function (c) { c.setAttribute('aria-invalid', 'true'); });
      if (!form.reportValidity() || missingCombo.length) {
        if (missingCombo.length) missingCombo[0].focus();
        return;
      }
      var dmec = val('dmec').split('/');
      var answers = {
        immatriculation: [val('immat_bloc1'), val('immat_bloc2'), val('immat_bloc3')].join('-').toUpperCase(),
        categorie: val('categorie'),
        constructeur: val('constructeur'),
        modele: val('modeleCommercial'),
        finition: val('finition'),
        dmec: dmec.length === 3 ? iso(dmec[0], dmec[1], dmec[2]) : '',
        cv: val('cv'),
        energie: val('energie'),
        valeur: val('valeurAchat'),
        usage: val('usageDeclare'),
        garage: (document.getElementById('hz-garage') || { getAttribute: function () { return ''; } }).getAttribute('data-value'),
        condNom: val('condNom'),
        condPrenom: val('condPrenom'),
        condNaissance: iso(val('cond_naiss_jour'), val('cond_naiss_mois'), val('cond_naiss_annee')),
        permis: val('obtentionPermis'),
        profession: val('professionExercee'),
        assure: val('assureActuel'),
        compagnie: val('compagnie'),
        crm: val('crm').replace(',', '.'),
        sinistres: val('sinistres'),
        resiliation: val('resiliation'),
        nom: val('nomUsage'),
        prenom: val('prenomSouscripteur'),
        naissance: val('neLe'),
        courriel: val('courriel'),
        telephone: [val('tel_1'), val('tel_2'), val('tel_3'), val('tel_4'), val('tel_5')].join(''),
        adresse: val('adressePostale'),
        cp: val('cp'),
        commune: val('commune')
      };
      save(answers);
      var button = form.querySelector('button[type="submit"]');
      if (button) { button.disabled = true; button.textContent = 'Calcul…'; }
      var overlay = document.getElementById('hz-calcul');
      if (overlay) overlay.hidden = false;
      setTimeout(function () { window.location.href = form.getAttribute('data-cible'); }, 900);
    });
  }

  // ── Page « Votre cotisation » : tarif fictif, formule Horizon ───────────────
  var annual = document.getElementById('hz-annuelle');
  if (annual) {
    var d = load();
    if (Object.keys(d).length > 0) {
      var now = new Date();
      var years = function (isoDate, fallback) {
        var t = Date.parse(isoDate || '');
        return Number.isNaN(t) ? fallback : (now.getTime() - t) / (365.25 * 24 * 3600 * 1000);
      };
      var age = years(d.condNaissance, 40);
      var licence = years(d.permis, 20);
      var vehicleAge = years(d.dmec, 5);
      var cv = Number(d.cv) || 6;
      var value = Number(d.valeur) || 15000;
      var crm = Number(d.crm) || 1;
      var claims = Number(d.sinistres) || 0;

      var premium = 365 + cv * 22 + claims * 120 + value * (vehicleAge <= 8 ? 0.018 : 0.008);
      if (licence < 3) premium += 180; else if (licence < 8) premium += 60;
      premium *= age < 21 ? 1.9 : age < 25 ? 1.55 : age < 30 ? 1.15 : age > 70 ? 1.25 : 1;
      if (d.usage === 'TRAJET') premium *= 1.07;
      if (d.usage === 'PRO') premium *= 1.25;
      if (d.garage === 'BOX') premium *= 0.95;
      if (d.garage === 'RUE') premium *= 1.12;
      if (d.categorie === 'VU') premium *= 1.18;
      if (d.categorie === '2R') premium *= 0.85;
      if (d.energie === 'EL') premium *= 0.92;
      if (d.resiliation === 'O') premium *= 1.5;
      if (d.assure === 'N') premium *= 1.1;
      premium = Math.round(premium * crm * 100) / 100;
      // Paiement mensuel : 3 % de frais de fractionnement.
      var monthly = Math.round((premium * 1.03 / 12) * 100) / 100;

      var fmt = function (n) { return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; };
      annual.textContent = fmt(premium);
      document.getElementById('hz-mensuelle').textContent = fmt(monthly);
      // Jeune conducteur : franchise générale relevée.
      var franchise = document.getElementById('hz-franchise');
      if (franchise) franchise.textContent = age < 25 || licence < 3 ? '500 €' : '250 €';
      var hash = 0;
      JSON.stringify(d).split('').forEach(function (c) { hash = (hash * 31 + c.charCodeAt(0)) % 10000; });
      var numero = document.getElementById('hz-numero');
      if (numero) numero.textContent = 'HZN-' + now.getFullYear() + '-' + ('000' + hash).slice(-4);
      var recap = document.getElementById('hz-recap');
      if (recap && d.nom) {
        recap.textContent = 'Projet établi pour ' + (d.prenom || '') + ' ' + d.nom + (d.constructeur ? ' — ' + d.constructeur + ' ' + (d.modele || '') : '') + '.';
      }
    }
    var restart = document.getElementById('hz-nouveau');
    if (restart) restart.addEventListener('click', function () { try { sessionStorage.removeItem(KEY); } catch (e) {} });
  }
})();
