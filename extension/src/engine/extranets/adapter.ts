/**
 * Adaptateur d'extranet : ce qu'un extranet fait à sa façon, isolé du moteur générique (analyse, mapping, remplissage,
 * avancement). Le moteur appelle toujours l'adaptateur ; `genericAdapter` donne le comportement par défaut, et chaque
 * extranet particulier (Zephir…) ne redéfinit que ce qui diffère. Ajouter un extranet = ajouter un fichier dans
 * `extranets/` et l'enregistrer dans `index.ts`, sans toucher au moteur ni aux autres extranets.
 */

/** Tableau à lignes répétables que l'extension sait remplir (une ligne par élément du dossier). */
export type RepeatableTable = 'claims';

export interface ExtranetAdapter {
  /** Nom court, pour les messages et les tests. */
  readonly id: string;
  /**
   * Champ obligatoire selon une marque propre à l'extranet, en plus des règles HTML / ARIA / astérisque communes
   * (lues par l'analyse). Appelé pour chaque champ : doit rester rapide (pas de parcours de toute la page).
   */
  isRequired(element: HTMLElement): boolean;
  /** Bouton (ou icône, ou texte cliquable) qui ajoute une ligne au tableau, s'il y en a un seul ; sinon `null`. */
  findAddRowButton(doc: Document, table: RepeatableTable): Element | null;
}

/**
 * Extranet configuré : l'assureur du catalogue (`ci_insurers/{insurerId}`), ses domaines (secours quand l'assureur
 * du job n'est pas connu) et son adaptateur. Déclaré dans `registry.ts`.
 */
export interface ExtranetDefinition {
  insurerId: string;
  /** Noms d'hôte de l'extranet (`zeole.zephir.fr`) ; un sous-domaine correspond aussi. */
  hosts: readonly string[];
  adapter: ExtranetAdapter;
}
