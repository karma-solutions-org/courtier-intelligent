/*
 * Démo type Oyat (locale) : devis auto en deux étapes (« Conducteur 1 », « Véhicule »), puis page « Votre tarif ».
 * « > Continuer Devis » refuse d'avancer tant qu'une ligne obligatoire (astérisque en image dans le label) est vide.
 * Les réponses restent dans le sessionStorage de l'onglet (jamais dans l'URL, jamais envoyées nulle part) ; la page
 * de tarif s'en sert pour calculer un tarif fictif.
 */
(function () {
  var KEY = 'oyat-devis-auto';
  function load() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function save(data) {
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* stockage indisponible : la démo continue */ }
  }
  var pad = function (n) { return ('0' + n).slice(-2); };
  var MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  // ── Repères de dates des libellés (« depuis Octobre 2023 ») : 3 et 5 ans avant aujourd'hui ─────
  var now = new Date();
  var since = function (years) { return MOIS[now.getMonth()] + ' ' + (now.getFullYear() - years); };
  Array.prototype.forEach.call(document.querySelectorAll('.dateMoins3Ans'), function (el) { el.textContent = since(3); });
  Array.prototype.forEach.call(document.querySelectorAll('.dateMoins5Ans'), function (el) { el.textContent = since(5); });

  var form = document.querySelector('form[data-etape]');
  if (form) {
    var etape = form.getAttribute('data-etape');

    // Date d'effet proposée par l'extranet : le lendemain (le courtier peut la changer).
    var effetJour = document.getElementById('oDateReprise_jour');
    if (effetJour && !effetJour.value) {
      var demain = new Date(now.getTime() + 24 * 3600 * 1000);
      effetJour.value = pad(demain.getDate());
      document.getElementById('oDateReprise_mois').value = pad(demain.getMonth() + 1);
      document.getElementById('oDateReprise_annee').value = String(demain.getFullYear());
    }

    // « Je ne la connais pas » : l'immatriculation n'est plus demandée.
    var inconnue = document.getElementById('bImmatInconnue');
    var immat = document.getElementById('oImmatriculation');
    if (inconnue && immat) {
      inconnue.addEventListener('change', function () {
        immat.disabled = inconnue.checked;
        if (inconnue.checked) immat.value = '';
      });
    }
    // « Aucune sanction » exclut les autres cases (et inversement).
    var zero = document.getElementById('bZeroSanction');
    if (zero) {
      var autres = ['bSanctionAlco', 'oUsageStupefiant', 'oBoolAutresSanction'].map(function (name) { return form.elements[name]; });
      zero.addEventListener('change', function () { if (zero.checked) autres.forEach(function (c) { c.checked = false; }); });
      autres.forEach(function (c) { c.addEventListener('change', function () { if (c.checked) zero.checked = false; }); });
    }

    /** Une ligne obligatoire est-elle remplie ? Toutes ses cases de texte, une liste choisie, un bouton radio coché. */
    var ligneRemplie = function (ligne) {
      var champs = Array.prototype.slice.call(ligne.querySelectorAll('.objet input:not([type="hidden"]):not([type="checkbox"]), .objet select'));
      var actifs = champs.filter(function (c) { return !c.disabled; });
      // Seule une case « Je ne la connais pas » cochée rend la ligne facultative.
      if (actifs.length === 0) return champs.length > 0;
      var radios = actifs.filter(function (c) { return c.type === 'radio'; });
      if (radios.length) return radios.some(function (r) { return r.checked; });
      return actifs.every(function (c) { return String(c.value || '').trim() !== ''; });
    };
    var marquer = function (ligne, enErreur) {
      var bloc = ligne.querySelector('.validation');
      if (!bloc) return;
      var img = bloc.querySelector('img');
      if (img) img.style.display = enErreur ? '' : 'none';
      var msg = bloc.querySelector('.error');
      if (enErreur && !msg) {
        msg = document.createElement('span');
        msg.className = 'error';
        msg.textContent = 'Champ obligatoire';
        bloc.appendChild(msg);
      }
      if (!enErreur && msg) msg.remove();
      ligne.classList.toggle('en-erreur', enErreur);
    };
    // Une ligne corrigée perd sa marque d'erreur.
    form.addEventListener('input', function (event) { var l = event.target.closest('.ligne'); if (l && ligneRemplie(l)) marquer(l, false); });
    form.addEventListener('change', function (event) { var l = event.target.closest('.ligne'); if (l && ligneRemplie(l)) marquer(l, false); });

    /** Réponses de l'étape, par nom de champ. */
    var reponses = function () {
      var out = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || el.type === 'hidden') return;
        if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; else if (!(el.name in out)) out[el.name] = ''; return; }
        if (el.type === 'checkbox') { out[el.name] = el.checked; return; }
        out[el.name] = String(el.value || '').trim();
        // Liste : son libellé aussi (récapitulatif de la page de tarif).
        if (el.tagName === 'SELECT' && el.selectedIndex >= 0) out[el.name + '_libelle'] = el.options[el.selectedIndex].text;
      });
      return out;
    };

    var erreurs = document.getElementById('oy-erreurs');
    var suivant = document.querySelector('.boutons .next');
    if (suivant) {
      suivant.addEventListener('click', function (event) {
        var manquantes = Array.prototype.filter.call(form.querySelectorAll('.ligne'), function (ligne) {
          var obligatoire = !!ligne.querySelector('label img[src*="asterisque"]');
          var ok = !obligatoire || ligneRemplie(ligne);
          marquer(ligne, !ok);
          return !ok;
        });
        if (manquantes.length) {
          // Lien sans suite : on reste sur l'étape.
          event.preventDefault();
          if (erreurs) {
            erreurs.textContent = manquantes.length === 1 ? 'Une information obligatoire est manquante.' : manquantes.length + ' informations obligatoires sont manquantes.';
            erreurs.hidden = false;
          }
          var premier = manquantes[0].querySelector('input, select');
          if (premier && premier.focus) premier.focus();
          return;
        }
        if (erreurs) { erreurs.hidden = true; erreurs.textContent = ''; }
        var data = load();
        data[etape] = reponses();
        save(data);
        // Le lien mène à l'étape suivante (href).
      });
    }
    var ajout = document.getElementById('oy-ajout-conducteur');
    if (ajout) ajout.addEventListener('click', function () { window.alert('Démonstration : un seul conducteur par devis.'); });
  }

  // ── Page « Votre tarif » : tarif fictif ─────────────────────────────────────
  var annuelle = document.getElementById('oy-annuelle');
  if (annuelle) {
    var d = load();
    var c = d.conducteur || {};
    var v = d.vehicule || {};
    if (d.conducteur && d.vehicule) {
      var annees = function (prefix, fallback) {
        var t = Date.parse(c[prefix + '_annee'] + '-' + pad(c[prefix + '_mois']) + '-' + pad(c[prefix + '_jour']));
        if (Number.isNaN(t)) t = Date.parse(v[prefix + '_annee'] + '-' + pad(v[prefix + '_mois']) + '-' + pad(v[prefix + '_jour']));
        return Number.isNaN(t) ? fallback : (now.getTime() - t) / (365.25 * 24 * 3600 * 1000);
      };
      var age = annees('oDateNaissance', 40);
      var permis = annees('oDatePermis', 15);
      var ageVehicule = annees('oDateMEC', 6);
      var crm = Number(String(c.oCRM || '').replace(',', '.')) || 1;
      var sinistres = Number(c.oNbSinistre36Mois) || 0;

      var prime = 420 + sinistres * 140 + (ageVehicule < 4 ? 160 : ageVehicule < 10 ? 70 : 0);
      if (permis < 3) prime += 220; else if (permis < 8) prime += 80;
      prime *= age < 23 ? 1.8 : age < 27 ? 1.35 : age > 72 ? 1.2 : 1;
      if (c.oNbMoisAssuranceV4 === '0') prime *= 1.25;
      if (c.oNbMoisAssuranceV4 === '1') prime *= 1.12;
      if (c.oResilAssPrec === '1' || c.oResilNPP === '1' || c.oResilAutreMotif === '1') prime *= 1.6;
      if (c.bSanctionAlco || c.oUsageStupefiant) prime *= 1.8;
      if (v.oUsage === '2') prime *= 1.06;
      if (v.oUsage === '3') prime *= 1.22;
      if (v.oModeGarage === 'G') prime *= 0.94;
      if (v.oModeGarage === 'V') prime *= 1.1;
      if (v.oEnergie === 'EL') prime *= 0.9;
      prime = Math.round(prime * crm * 100) / 100;
      // Paiement mensuel : 2 % de frais de fractionnement.
      var mensuelle = Math.round((prime * 1.02 / 12) * 100) / 100;

      var fmt = function (n) { return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; };
      annuelle.textContent = fmt(prime);
      document.getElementById('oy-mensuelle').textContent = fmt(mensuelle);
      var franchise = document.getElementById('oy-franchise');
      if (franchise) franchise.textContent = permis < 3 ? '600 €' : '300 €';
      var hash = 0;
      JSON.stringify(d).split('').forEach(function (ch) { hash = (hash * 31 + ch.charCodeAt(0)) % 100000; });
      var numero = document.getElementById('oy-numero');
      if (numero) numero.textContent = 'OYD-' + now.getFullYear() + '-' + ('0000' + hash).slice(-5);
      var recap = document.getElementById('oy-recap');
      if (recap && c.oNom) {
        var vehicule = [v.oMarque_libelle, v.oModele].filter(Boolean).join(' ');
        recap.textContent = 'Devis établi pour ' + (c.oPrenom || '') + ' ' + c.oNom + (vehicule ? ' — véhicule ' + vehicule + (v.oImmatriculation ? ' (' + v.oImmatriculation + ')' : '') : '') + '.';
      }
    }
    var nouveau = document.getElementById('oy-nouveau');
    if (nouveau) nouveau.addEventListener('click', function () { try { sessionStorage.removeItem(KEY); } catch (e) {} });
  }
})();
