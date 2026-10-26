import { RESULT_TABLE } from '../../__fixtures__/resultats';
import { mountExtranet, type ExtranetSimulator, type SimulatedPage } from '../testing/simulator';

/**
 * Oyat (extranet.oyat-assurances.fr), devis Auto, reconstitué à partir du HTML RÉEL relevé sur l'extranet le 26/10/2026
 * (cadre `souscripteur_crm.cfm`, valeurs saisies vidées, longues listes réduites à leurs premières options).
 *
 * Ce qui fait la particularité d'Oyat et qui doit continuer de fonctionner :
 * - une ligne par question : `div.ligne` > `<label>` puis `<div>` qui porte le ou les champs ;
 * - le label vise souvent un id ABSENT (`for="oDateReprise"` pour les cases `oDateReprise_jour/_mois/_annee`), ou n'a
 *   pas de `for` (boutons radio « Civilité », « Avez-vous été assuré… ») ;
 * - chaque section est un `<fieldset>` dont la `<legend>` est un TITRE de section, pas la question des boutons radio ;
 * - le champ obligatoire est marqué par une IMAGE `asterisque.gif` dans le label (pas d'astérisque en texte) ;
 * - le bouton pour passer à la suite est « > Continuer Devis » (flèche en tête).
 */
export const OYAT_ORIGIN = 'https://extranet.oyat-assurances.fr';

/** Marque « obligatoire » d'Oyat : une image dans le label. */
const STAR = '<img src="https://extranet.oyat-assurances.fr/ressources/images/asterisque.gif" alt="">';

const line = (id: string, label: string, field: string, labelFor: string | null = id) => `
  <div id="ligne_${id}" class="ligne">
    <label id="libelle_${id}"${labelFor ? ` for="${labelFor}"` : ''}>${label}</label>
    <div class="puce_aide" id="puce_aide_${id}">&nbsp;</div>
    <div id="objet_${id}" class="objet">${field}</div>
    <div id="blocValidation_${id}" class="validation"><img src="https://extranet.oyat-assurances.fr/ressources/images/coche_cancel.gif" style="display:none" alt=""></div>
  </div>`;

const date = (name: string) =>
  `<input name="${name}_jour" type="text" id="${name}_jour" class="texte" maxlength="2"> <input name="${name}_mois" type="text" id="${name}_mois" class="texte" maxlength="2"> <input name="${name}_annee" type="text" id="${name}_annee" class="texte" maxlength="4">`;

const text = (name: string, maxLength = 250) => `<input name="${name}" type="text" id="${name}" class="texte" maxlength="${maxLength}">`;

const yesNo = (name: string) =>
  `<input id="${name}_1" name="${name}" type="radio" class="choix" value="1">Oui <input id="${name}_0" name="${name}" type="radio" class="choix" value="0">Non`;

const PAYS = `<option value="61">France</option><option value="0">-------------------</option><option value="191">Afghanistan</option><option value="192">Afrique du Sud</option><option value="193">Albanie</option><option value="194">Algérie</option><option value="195">Allemagne</option><option value="245">Tunisie</option>`;

const TABS = `
  <h1>Devis automobile : Etape 1</h1>
  <div class="onglets"><a class="onglet actif">&gt; Conducteur 1</a> <a class="onglet">&gt; Véhicule</a></div>`;

const CONDUCTEUR = `${TABS}
  <form id="monform_crm" name="monform_crm">
    <input type="Hidden" name="ordre_cond"><input type="Hidden" name="zsouscr_id">
    <div class="container">
      <fieldset>
        ${line('oNomPrenomSaisieDevis', 'Pour une meilleure traçabilité de vos devis,<br>merci d\'indiquer vos noms et prénoms', text('oNomPrenomSaisieDevis'))}
        ${line('oDateReprise', `Date d'effet souhaitée :${STAR}`, date('oDateReprise'))}
      </fieldset>
      <fieldset>
        <legend>Conducteur 1</legend>
        ${line('oSexe', `Civilité ${STAR}`, '<input name="oSexe" type="radio" class="choix" value="H">Homme <input name="oSexe" type="radio" class="choix" value="F">Femme', null)}
        ${line('oNom', `Nom :${STAR}`, text('oNom'))}
        ${line('oPrenom', `Prénom :${STAR}`, text('oPrenom'))}
        ${line('oDateNaissance', `Date de naissance :${STAR}`, date('oDateNaissance'), 'oDateNaissance_jour')}
        ${line('oPaysNaiss', `Pays de naissance :${STAR}`, `<select name="oPaysNaiss" id="oPaysNaiss" class="liste">${PAYS}</select>`)}
        ${line('oVilleNaissSaisieLibre', `Ville de naissance :${STAR}`, text('oVilleNaissSaisieLibre'))}
        ${line('oSituationFam', `Situation familiale :${STAR}`, '<select name="oSituationFam" id="oSituationFam" class="liste"><option value="celibataire">Célibataire</option><option value="marie">Marié(e)</option><option value="union_libre">Union libre</option><option value="divorce">Divorcé(e)</option><option value="veuf">Veuf(ve)</option></select>')}
        ${line('oProfession', `Profession :${STAR}`, '<select name="oProfession" id="oProfession" class="liste"><option value="">Choisissez</option><option value="104">Salarié Sédentaire</option><option value="115">Salarié Non Sédentaire</option><option value="211">Fonctionnaire Sédentaire</option></select>')}
        ${line('oDatePermis', `Date de permis (date du permis d'origine) :${STAR}`, date('oDatePermis'), 'oDatePermis_jour')}
        ${line('oPays', `Pays d'obtention du permis :${STAR}`, `<select name="oPays" id="oPays" class="liste">${PAYS}</select>`)}
        ${line('oConduite', `Permis obtenu dans le cadre de l'AAC${STAR}`, '<input name="oConduite" type="radio" class="choix" value="1">Oui <input name="oConduite" type="radio" class="choix" value="0">Non', null)}
        ${line('oCodePostal', `Code postal l'adresse :${STAR}`, '<div id="refContainer"><input class="text" type="text" name="oCodePostal" id="oCodePostal" maxlength="5"><br></div>')}
        ${line('oAdresse1', 'Adresse :', '<input class="text" type="text" name="oAdresse1" id="oAdresse1"><ul class="suggestions-list"></ul>')}
        ${line('oAdresse2', 'Adresse<i>(suite)</i> :', '<input class="text" type="text" name="oAdresse2" id="oAdresse2" placeholder="Complément d\'adresse"><div></div>')}
        ${line('oVille', `Ville :${STAR}`, '<select name="oVille" id="oVille" class="liste"><option value="">Sélectionner une ville...</option><option value="MARSEILLE">MARSEILLE</option></select>')}
        ${line('oNumeroTelephone', 'Téléphone fixe :', '<input class="text" type="text" name="oNumeroTelephone" id="oNumeroTelephone" maxlength="10">')}
        ${line('oNumeroTelephonePortable', 'Téléphone portable :', '<input class="text" type="text" name="oNumeroTelephonePortable" id="oNumeroTelephonePortable" maxlength="10">')}
        ${line('oEmail', 'Email :', '<input class="text" type="text" name="oEmail" id="oEmail" maxlength="250">')}
      </fieldset>
      <fieldset>
        <legend>Antécédents d'assurance <small>(sur les 36 derniers mois)</small></legend>
        ${line(
          'oNbMoisAssuranceV4',
          `Avez-vous été assuré et/ou désigné sur un contrat automobile ?${STAR}<br>(Comptabilisez l'intégralité des antécédents depuis <span class="dateMoins3Ans">Octobre 2023</span>)<br><a>Aide calcul antécédents</a>`,
          `<input name="oNbMoisAssuranceV4" type="radio" id="oNbMoisAssuranceV4_0" class="choix" value="0"> Non, aucune assurance<br>
           <input name="oNbMoisAssuranceV4" type="radio" id="oNbMoisAssuranceV4_1" class="choix" value="1"> Oui, moins de 9 mois<br>
           <input name="oNbMoisAssuranceV4" type="radio" id="oNbMoisAssuranceV4_9" class="choix" value="9"> Oui, de 9 à 23 mois<br>
           <input name="oNbMoisAssuranceV4" type="radio" id="oNbMoisAssuranceV4_24" class="choix" value="24"> Oui, 24 mois et plus<br>`,
          null,
        )}
        <h4>Résiliation(s) depuis Octobre 2023</h4>
        ${line('oResilAssPrec', `Avez-vous été résilié par un précédent assureur<br>depuis <span class="dateMoins3Ans">Octobre 2023</span> ?${STAR}`, yesNo('oResilAssPrec'), null)}
        ${line('oResilNPP', `Avez-vous été résilié pour non-paiement (NPP) ?${STAR}`, yesNo('oResilNPP'), null)}
        ${line('oResilAutreMotif', `Avez-vous été résilié par la compagnie pour un autre motif ?${STAR}`, yesNo('oResilAutreMotif'), null)}
        ${line('oNulliteFauseDeclaFraude', `Avez-vous fait l’objet d’une nullité pour fausse déclaration ?${STAR}`, yesNo('oNulliteFauseDeclaFraude'), null)}
        <h4>CRM</h4>
        ${line('oCRM', `Bonus/Malus déclaré à la date d'effet souhaitée${STAR}<br>(N'oubliez pas d'impacter les éventuels sinistres)`, '<input class="text" type="text" name="oCRM" id="oCRM" maxlength="4"><i>(ex : 0.50)</i>')}
      </fieldset>
      <fieldset>
        <legend>Infraction(s) relative(s) à la conduite d'un véhicule (Depuis Octobre 2021)</legend>
        ${line(
          'oBoolSanctionPenaleAdmin',
          '<strong>Sanction(s)</strong> au cours des 5 dernières années ?<br><span id="id5LastYear2">(Depuis Octobre 2021)</span>',
          `<div><input type="Checkbox" name="bZeroSanction" id="bZeroSanction"> Aucune sanction (ni alcoolémie, ni stupéfiant, ni autre)</div><br>
           <div><input type="Checkbox" name="bSanctionAlco"> Sanction(s) pour <strong>alcoolémie</strong></div>
           <div><input type="Checkbox" name="oUsageStupefiant"> Sanction(s) pour <strong>stupéfiant</strong></div>
           <div><input type="Checkbox" name="oBoolAutresSanction"><strong>Autre(s) sanction(s)</strong> pénale(s) ou administrative(s)</div>`,
          null,
        )}
      </fieldset>
      <fieldset>
        <legend>Autre information</legend>
        ${line('oInfirmite', `Troubles neuromoteurs et/ou neuropsychiques${STAR}`, '<input name="oInfirmite" type="radio" class="choix" value="1">Oui <input name="oInfirmite" type="radio" class="choix" value="0">Non', null)}
      </fieldset>
      <fieldset>
        <legend>Sinistres</legend>
        ${line('oNbSinistre36Mois', `Nombres de sinistres survenus sur les 36 derniers mois :${STAR}`, '<input class="text" type="text" name="oNbSinistre36Mois" id="oNbSinistre36Mois" maxlength="1"><i>(6 maximum)</i>')}
      </fieldset>
    </div>
  </form>
  <div class="boutons"><a role="button" class="btn">Ajouter un Conducteur</a> <a role="button" class="btn next">&gt; Continuer Devis</a></div>`;

/** Étape « Véhicule » : non relevée pour l'instant (le parcours s'arrête au conducteur tant qu'Oyat le refuse). */
export const OYAT_PAGES: SimulatedPage[] = [
  { name: 'conducteur', html: CONDUCTEUR },
  { name: 'tarifs', html: RESULT_TABLE },
];

export const mountOyat = (doc: Document): ExtranetSimulator =>
  mountExtranet(doc, { pages: OYAT_PAGES, nextButton: '', nextSelector: '.next' });
