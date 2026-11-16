/**
 * Zephir (zeole.zephir.fr), parcours Auto « classique », reconstitué à partir du HTML réel relevé sur l'extranet
 * (Angular Material, formulaires ngModel) : sert au test de non-régression Zephir (journey.test.ts).
 *
 * Ce qui fait la particularité de Zephir et qui doit continuer de fonctionner :
 * - boutons Oui / Non `mat-button-toggle-group` sans formcontrolname, obligatoires par la classe « ng-invalid » ;
 * - la question dans un `<label><span>` AU-DESSUS du bloc qui contient le groupe ;
 * - « Ajouter un sinistre » : un `<span>` suivi d'une icône `<svg>` dans `div.btnAjoutTable` ;
 * - deux pages d'antécédents identiques (conducteur principal puis secondaire) ;
 * - une page « Résumé » sans champ, avec un volet « Synthèse » qui contient le mot « sinistre » sur toutes les pages ;
 * - « Remorque / Caravane » et ses boutons juste avant la liste « Classe socio-professionnelle ».
 */

import { RESULT_TABLE } from '../../__fixtures__/resultats';
import { mountExtranet, type ExtranetSimulator, type SimulatedPage } from '../testing/simulator';

export const ZEPHIR_ORIGIN = 'https://zeole.zephir.fr';

/** Volet « Synthèse » affiché à droite sur toutes les pages. */
const SYNTHESE = `<aside class="synthese"><h4>Sinistralité</h4><p>1 sinistre(s) corporel responsable(s)</p></aside>`;

/** Groupe Oui / Non tel que Zephir l'écrit (question au-dessus du bloc du groupe). */
const toggle = (name: string, question: string) => `
  <div class="form-input"><label><span>${question}</span></label>
    <div class="form-input"><mat-button-toggle-group role="group" required="" zcontrol="" class="mat-button-toggle-group ng-untouched ng-pristine ng-invalid">
      <mat-button-toggle value="true"><button type="button" class="mat-button-toggle-button" aria-pressed="false" name="${name}"><span class="mat-button-toggle-label-content"><span>Oui</span></span></button></mat-button-toggle>
      <mat-button-toggle value="false"><button type="button" class="mat-button-toggle-button" aria-pressed="false" name="${name}"><span class="mat-button-toggle-label-content"><span>Non</span></span></button></mat-button-toggle>
    </mat-button-toggle-group><app-control-error></app-control-error></div></div>`;

const NEXT = `<div class="actions"><button type="button" class="boutonAbandon">Abandonner</button><button type="button" class="boutonSubmit"><span class="mat-button-wrapper"> Suivant </span></button></div>`;

export const DECLARATIONS = {
  permis: 'Les conducteurs désignés disposent-ils d’un permis de conduire en cours de validité et reconnu en France donnant droit à son titulaire de conduire un véhicule ?',
  incompatible: 'L’un des conducteurs désignés se trouve-il dans une situation légalement incompatible avec le maintien ou la délivrance du permis de conduire, notamment celle relative à son état de santé ?',
  transport: 'Le véhicule est-il utilisé pour le transport de matières dangereuses, pour le transport public de voyageurs ou de marchandises, taxis, auto-école, ambulance ou véhicule donné en location ?',
};

const claimsPage = (title: string) => `
  <h3>${title}</h3>
  <h5>Veuillez déclarer les sinistres survenus sur les 36 derniers mois</h5>
  <table class="mat-table"><thead><tr><th>Numéro de sinistre</th><th>Date de survenance</th><th>Type de sinistre</th><th>Taux de responsabilité</th></tr></thead><tbody></tbody></table>
  <div class="btnAjoutTable"><span style="margin-right: 5px;">Ajouter un sinistre</span><svg class="svg-inline--fa fa-circle-plus" role="img" viewBox="0 0 512 512"><path d="M0 0"></path></svg></div>`;

/** Pages du parcours, dans l'ordre. La dernière affiche les tarifs. */
export const ZEPHIR_PAGES: SimulatedPage[] = [
  {
    name: 'vehicule',
    html: `<h3>Informations complémentaires</h3>
      <div class="form-input"><label for="dmec">Date de mise en circulation</label><input id="dmec" name="dateMec" type="text" /></div>
      <div class="form-input"><label for="cp">Code postal du lieu de stationnement</label><input id="cp" name="cpStationnement" type="text" /></div>
      <div class="form-input"><label for="ville">Ville du lieu de stationnement</label><input id="ville" name="villeStationnement" type="text" /></div>
      ${toggle('GARAGE', 'Garage')}
      <div class="form-input"><div><span>Remorque / Caravane :</span>
        <mat-button-toggle-group role="group" class="ng-valid"><button type="button" aria-pressed="true">- de 750kg</button><button type="button" aria-pressed="false">+ de 750kg</button></mat-button-toggle-group></div>
        <div><select name="csp"><option value="">Choisir</option><option>Salarié non sédentaire</option><option>Artisan sédentaire</option></select></div></div>`,
  },
  { name: 'antecedents-principal', html: claimsPage('Antécédents de Monsieur DUPONT JEAN') },
  { name: 'antecedents-secondaire', html: claimsPage('Antécédents de Monsieur DUPONT JEAN') },
  { name: 'resume', html: `<h3>Résumé</h3><p>Conducteur Principal : Monsieur DUPONT JEAN</p><p>Conducteur Secondaire : Monsieur DUPONT JEAN</p>` },
  {
    name: 'declarations',
    html: `<h3>Déclarations complémentaires</h3>${toggle('AUTO01', DECLARATIONS.permis)}${toggle('AUTO02', DECLARATIONS.incompatible)}${toggle('AUTO03', DECLARATIONS.transport)}`,
  },
  // Page de tarifs : le format de lecture est couvert par les tests de capture (resultats.ts), pas propre à Zephir.
  { name: 'tarifs', html: RESULT_TABLE },
];

/** Ligne de sinistre ajoutée par « Ajouter un sinistre ». */
const claimRow = (n: number) => `<tr>
  <td>Sinistre ${n}</td>
  <td><input name="dateSurvenance${n}" type="text" placeholder="jj/mm/aaaa" /></td>
  <td><select name="typeSinistre${n}"><option value=""></option><option value="MAT">Matériel</option><option value="CORP">Corporel</option></select></td>
  <td><select name="tauxResp${n}"><option value=""></option><option value="0">0 %</option><option value="50">50 %</option><option value="100">100 %</option></select></td>
</tr>`;

/** Parcours Zephir : « Suivant » refusé tant qu'un groupe Oui / Non obligatoire est sans réponse (classe ng-invalid). */
export const mountZephir = (doc: Document): ExtranetSimulator =>
  mountExtranet(doc, {
    pages: ZEPHIR_PAGES,
    chrome: SYNTHESE,
    nextButton: NEXT,
    nextSelector: '.boutonSubmit',
    unansweredSelector: 'mat-button-toggle-group[required].ng-invalid',
    toggleGroupSelector: 'mat-button-toggle-group',
    toggleAnsweredClass: { remove: 'ng-invalid', add: 'ng-valid' },
    addRow: { selector: '.btnAjoutTable', row: claimRow },
  });
