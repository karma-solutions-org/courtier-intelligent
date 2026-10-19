/**
 * Pages de résultat simulées (après « Obtenir mon tarif »), pour la capture du tarif (E10). Elles reprennent ce que
 * montrent les extranets : rappel des données du client, primes, numéro de devis, tableau ou liste des garanties,
 * exclusions. Les vrais extranets n'étant pas encore accessibles, ce sont les références des tests.
 */

/** Assureur A : primes mises en avant, tableau des garanties (incluse, plafond, franchise), exclusions en liste. */
export const RESULT_TABLE = `
  <header><strong>Extranet Assureur A</strong></header>
  <main>
    <h1>Votre tarif personnalisé</h1>
    <p class="recap">Devis établi pour Jean Dupont, né le 12/03/1985 — véhicule AB-123-CD (Renault Clio).</p>
    <p>Devis n° DEV-2026-0042 · valable 30 jours</p>
    <div class="price-box">
      <span>Prime annuelle TTC</span>
      <strong class="price">642,30 €</strong>
      <span>soit</span>
      <strong>53,53 € / mois</strong>
    </div>
    <p>Franchise générale : 300 €</p>
    <p>Frais de dossier : 25 €</p>
    <h2>Vos garanties</h2>
    <table>
      <thead><tr><th>Garantie</th><th>Incluse</th><th>Plafond</th><th>Franchise</th></tr></thead>
      <tbody>
        <tr><td>Responsabilité civile</td><td>✓</td><td>Illimité</td><td>—</td></tr>
        <tr><td>Vol</td><td>Oui</td><td>15 000 €</td><td>300 €</td></tr>
        <tr><td>Bris de glace</td><td>En option</td><td>—</td><td>150 €</td></tr>
        <tr><td>Assistance 0 km</td><td>Incluse</td><td>—</td><td>—</td></tr>
      </tbody>
    </table>
    <h2>Exclusions principales</h2>
    <ul>
      <li>Conduite sans permis valide</li>
      <li>Conduite sous l’emprise d’un état alcoolique</li>
    </ul>
    <button type="button">Modifier mon devis</button>
    <button type="button">Souscrire</button>
  </main>`;

/** Assureur B : primes en liste de définitions, garanties en liste à puces. */
export const RESULT_LIST = `
  <h1>Récapitulatif de votre offre</h1>
  <p>Référence du devis : Q7781-B</p>
  <dl>
    <dt>Cotisation mensuelle</dt><dd>48,90 €</dd>
    <dt>Cotisation annuelle</dt><dd>586,80 €</dd>
  </dl>
  <h3>Garanties</h3>
  <ul>
    <li>Responsabilité civile : incluse</li>
    <li>Incendie – plafond 20 000 €, franchise 250 €</li>
    <li>Défense pénale : non incluse</li>
  </ul>`;

/** Page de résultat dont les montants ne sont reconnaissables ni par leur libellé ni par leur périodicité : l'IA aide. */
export const RESULT_FREE_TEXT = `
  <h1>Votre devis</h1>
  <p>Merci Jean Dupont (jean@example.fr, 06 12 34 56 78). Pour le véhicule AB123CD, nous vous proposons
  une formule à 712 € réglable en une fois, ou 61,20 € par prélèvement.</p>
  <p>Inclus : responsabilité civile, vol et incendie.</p>`;

/** Page de résultat attendue, mais sans aucun tarif lisible (calcul encore en cours, erreur de l'extranet). */
export const RESULT_EMPTY = `
  <h1>Votre devis</h1>
  <p>Votre devis est en cours de calcul. Merci de patienter.</p>`;
