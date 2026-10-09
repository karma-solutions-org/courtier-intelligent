import type { CanonicalPath } from '@shared';
import type { FieldKind } from './analyzer';

/** Type de réponse attendu pour un chemin canonique : détermine les champs HTML compatibles. */
export type Expected = 'text' | 'date' | 'number' | 'boolean' | 'choice';

export const PATH_EXPECTED: Record<CanonicalPath, Expected> = {
  'client.firstName': 'text',
  'client.lastName': 'text',
  'client.nationalId': 'text',
  'client.birthDate': 'date',
  'client.phone': 'text',
  'client.email': 'text',
  'client.address.street': 'text',
  'client.address.postalCode': 'text',
  'client.address.city': 'text',
  'client.address.country': 'text',
  'vehicle.registration': 'text',
  'vehicle.brand': 'text',
  'vehicle.model': 'text',
  'vehicle.version': 'text',
  'vehicle.firstRegistrationDate': 'date',
  'vehicle.fiscalPower': 'number',
  'vehicle.vehicleValue': 'number',
  'vehicle.vehicleType': 'choice',
  'vehicle.usage': 'choice',
  'vehicle.parkingType': 'choice',
  'vehicle.purchaseDate': 'date',
  'driver.firstName': 'text',
  'driver.lastName': 'text',
  'driver.birthDate': 'date',
  'driver.licenseDate': 'date',
  'driver.licenseType': 'choice',
  'driver.profession': 'text',
  'driver.phone': 'text',
  'insuranceHistory.currentlyInsured': 'boolean',
  'insuranceHistory.previousInsurer': 'text',
  'insuranceHistory.previousContractStartDate': 'date',
  'insuranceHistory.previousContractEndDate': 'date',
  'insuranceHistory.seniority': 'number',
  'insuranceHistory.bonusMalus': 'number',
  'insuranceHistory.claimsCount': 'number',
  'insuranceHistory.responsibleClaimsCount': 'number',
  'insuranceHistory.nonResponsibleClaimsCount': 'number',
  'insuranceHistory.wasTerminated': 'boolean',
  'insuranceHistory.terminatedByInsurer': 'boolean',
  'insuranceHistory.terminationReason': 'choice',
  'insuranceHistory.terminationDate': 'date',
};

/** Champs HTML qui peuvent porter chaque type de réponse. */
export const COMPATIBLE_KINDS: Record<Expected, FieldKind[]> = {
  text: ['text', 'textarea', 'autocomplete', 'select'],
  date: ['date', 'text'],
  number: ['number', 'text', 'select'],
  boolean: ['radio', 'checkbox', 'select'],
  choice: ['select', 'radio', 'autocomplete'],
};

export interface FieldSynonyms {
  /** Libellés que les extranets emploient (comparés sans accents ni casse). */
  labels: string[];
  /** Mots des attributs `name` / `id`. */
  names?: string[];
  /** Valeurs de l'attribut HTML `autocomplete`. */
  autocomplete?: string[];
}

export const FIELD_SYNONYMS: Record<CanonicalPath, FieldSynonyms> = {
  'client.firstName': { labels: ['prenom', 'votre prenom', 'prenom du souscripteur', 'prenom du titulaire'], names: ['prenom', 'firstname', 'givenname'], autocomplete: ['given-name'] },
  'client.lastName': { labels: ['nom', 'votre nom', 'nom de famille', 'nom du souscripteur', 'nom du titulaire', 'nom d usage'], names: ['nom', 'lastname', 'familyname', 'surname'], autocomplete: ['family-name'] },
  'client.nationalId': { labels: ['numero de securite sociale', 'n securite sociale', 'numero d identification', 'numero insee', 'piece d identite'], names: ['nir', 'secu', 'insee'] },
  'client.birthDate': { labels: ['date de naissance', 'ne le', 'ne e le', 'naissance', 'date de naissance du souscripteur'], names: ['birthdate', 'dateofbirth', 'naissance', 'dob'], autocomplete: ['bday'] },
  'client.phone': { labels: ['telephone', 'telephone mobile', 'numero de telephone', 'tel', 'mobile', 'portable', 'telephone portable'], names: ['phone', 'tel', 'telephone', 'mobile'], autocomplete: ['tel', 'tel-national'] },
  'client.email': { labels: ['email', 'e mail', 'adresse email', 'adresse e mail', 'courriel', 'votre email', 'votre e mail', 'mail'], names: ['email', 'mail', 'courriel'], autocomplete: ['email'] },
  'client.address.street': { labels: ['adresse', 'adresse postale', 'numero et nom de la rue', 'rue', 'voie', 'numero et voie', 'adresse de residence'], names: ['adresse', 'address', 'street', 'rue', 'voie'], autocomplete: ['street-address', 'address-line1'] },
  'client.address.postalCode': { labels: ['code postal', 'cp', 'code postal du domicile'], names: ['postalcode', 'zipcode', 'zip', 'codepostal', 'cp'], autocomplete: ['postal-code'] },
  'client.address.city': { labels: ['ville', 'commune', 'ville de residence', 'localite'], names: ['city', 'ville', 'commune'], autocomplete: ['address-level2'] },
  'client.address.country': { labels: ['pays', 'pays de residence'], names: ['country', 'pays'], autocomplete: ['country-name', 'country'] },

  'vehicle.registration': { labels: ['immatriculation', 'numero d immatriculation', 'plaque d immatriculation', 'plaque', 'immat', 'n d immatriculation'], names: ['immatriculation', 'immat', 'registration', 'plaque', 'licenseplate'] },
  'vehicle.brand': { labels: ['marque', 'marque du vehicule', 'constructeur'], names: ['marque', 'brand', 'make'] },
  'vehicle.model': { labels: ['modele', 'modele du vehicule'], names: ['modele', 'model'] },
  'vehicle.version': { labels: ['version', 'finition', 'motorisation', 'version du vehicule'], names: ['version', 'finition', 'trim'] },
  'vehicle.firstRegistrationDate': { labels: ['date de premiere mise en circulation', 'premiere mise en circulation', 'date de mise en circulation', 'mise en circulation', 'date de 1ere mise en circulation', 'date de 1ere immatriculation', 'premiere immatriculation'], names: ['miseencirculation', 'dmec', 'firstregistration', 'pmec'] },
  'vehicle.fiscalPower': { labels: ['puissance fiscale', 'puissance fiscale en cv', 'cv fiscaux', 'puissance cv', 'chevaux fiscaux', 'cv'], names: ['puissance', 'fiscalpower', 'cv', 'cvfiscaux'] },
  'vehicle.vehicleValue': { labels: ['valeur du vehicule', 'valeur a neuf', 'valeur d achat', 'valeur estimee', 'valeur venale', 'prix du vehicule', 'valeur'], names: ['valeur', 'vehiclevalue', 'prix'] },
  'vehicle.vehicleType': { labels: ['type de vehicule', 'categorie du vehicule', 'type', 'categorie'], names: ['vehicletype', 'typevehicule', 'categorie'] },
  'vehicle.usage': { labels: ['usage du vehicule', 'usage', 'utilisation du vehicule', 'utilisation', 'type d usage', 'usage principal'], names: ['usage', 'utilisation'] },
  'vehicle.parkingType': { labels: ['stationnement', 'lieu de stationnement', 'stationnement de nuit', 'lieu de stationnement la nuit', 'garage', 'lieu de garage', 'ou stationne votre vehicule'], names: ['stationnement', 'parking', 'garage'] },
  'vehicle.purchaseDate': { labels: ['date d achat', 'date d acquisition', 'achete le', 'date d achat du vehicule'], names: ['purchasedate', 'achat', 'acquisition'] },

  'driver.firstName': { labels: ['prenom du conducteur', 'prenom conducteur', 'prenom du conducteur principal'], names: ['driverfirstname', 'prenomconducteur'] },
  'driver.lastName': { labels: ['nom du conducteur', 'nom conducteur', 'nom du conducteur principal'], names: ['driverlastname', 'nomconducteur'] },
  'driver.birthDate': { labels: ['date de naissance du conducteur', 'naissance du conducteur', 'date de naissance conducteur'], names: ['driverbirthdate', 'naissanceconducteur'] },
  'driver.licenseDate': { labels: ['date d obtention du permis', 'date du permis', 'obtention du permis', 'permis obtenu le', 'date d obtention du permis de conduire', 'date de permis'], names: ['licensedate', 'datepermis', 'obtentionpermis', 'permis'] },
  'driver.licenseType': { labels: ['type de permis', 'categorie de permis', 'permis', 'permis de conduire'], names: ['licensetype', 'typepermis', 'categoriepermis'] },
  'driver.profession': { labels: ['profession', 'metier', 'situation professionnelle', 'categorie socio professionnelle', 'csp', 'activite professionnelle'], names: ['profession', 'metier', 'csp', 'job'], autocomplete: ['organization-title'] },
  'driver.phone': { labels: ['telephone du conducteur', 'telephone conducteur'], names: ['driverphone'] },

  'insuranceHistory.currentlyInsured': { labels: ['etes vous actuellement assure', 'actuellement assure', 'etes vous assure', 'deja assure', 'avez vous un contrat en cours', 'assure actuellement', 'avez vous deja ete assure'], names: ['currentlyinsured', 'dejaassure', 'assureactuellement'] },
  'insuranceHistory.previousInsurer': { labels: ['assureur actuel', 'assureur precedent', 'compagnie actuelle', 'compagnie d assurance actuelle', 'ancien assureur', 'assureur', 'votre assureur actuel'], names: ['assureur', 'previousinsurer', 'insurer', 'compagnie'] },
  'insuranceHistory.previousContractStartDate': { labels: ['date de debut du contrat actuel', 'debut du contrat actuel', 'date d effet du contrat actuel', 'assure depuis le', 'date de souscription du contrat actuel'], names: ['contractstart', 'debutcontrat', 'dateeffet'] },
  'insuranceHistory.previousContractEndDate': { labels: ['date d echeance du contrat', 'echeance du contrat actuel', 'echeance', 'date d echeance', 'fin du contrat actuel', 'date de fin du contrat'], names: ['contractend', 'echeance', 'findecontrat'] },
  'insuranceHistory.seniority': { labels: ['anciennete d assurance', 'anciennete', 'duree d assurance', 'depuis combien de temps etes vous assure', 'anciennete d assurance en mois'], names: ['seniority', 'anciennete'] },
  'insuranceHistory.bonusMalus': { labels: ['bonus malus', 'coefficient bonus malus', 'crm', 'coefficient de reduction majoration', 'coefficient crm', 'votre bonus malus'], names: ['bonusmalus', 'crm', 'bonus'] },
  'insuranceHistory.claimsCount': { labels: ['nombre de sinistres', 'sinistres', 'sinistres sur les 36 derniers mois', 'nombre de sinistres declares', 'sinistres des 3 dernieres annees', 'nombre de sinistres sur 36 mois'], names: ['claims', 'sinistres', 'nbsinistres', 'claimscount'] },
  'insuranceHistory.responsibleClaimsCount': { labels: ['sinistres responsables', 'dont sinistres responsables', 'nombre de sinistres responsables', 'sinistres totalement ou partiellement responsables'], names: ['responsibleclaims', 'sinistresresponsables'] },
  'insuranceHistory.nonResponsibleClaimsCount': { labels: ['sinistres non responsables', 'dont sinistres non responsables', 'nombre de sinistres non responsables'], names: ['nonresponsibleclaims', 'sinistresnonresponsables'] },
  'insuranceHistory.wasTerminated': { labels: ['avez vous deja ete resilie', 'deja resilie', 'resiliation', 'avez vous ete resilie', 'contrat resilie', 'avez vous fait l objet d une resiliation'], names: ['wasterminated', 'resilie', 'resiliation'] },
  'insuranceHistory.terminatedByInsurer': { labels: ['resiliation a l initiative de l assureur', 'resilie par l assureur', 'resiliation par l assureur', 'a l initiative de l assureur'], names: ['terminatedbyinsurer', 'resilieparassureur'] },
  'insuranceHistory.terminationReason': { labels: ['motif de la resiliation', 'motif de resiliation', 'cause de la resiliation', 'raison de la resiliation', 'motif'], names: ['terminationreason', 'motifresiliation'] },
  'insuranceHistory.terminationDate': { labels: ['date de resiliation', 'date de la resiliation', 'resilie le'], names: ['terminationdate', 'dateresiliation'] },
};

/** Mots qui rattachent un champ à une famille de chemins : départagent « Nom » du souscripteur et « Nom » du conducteur. */
export const PREFIX_KEYWORDS: Record<string, string[]> = {
  client: ['souscripteur', 'titulaire', 'preneur', 'proprietaire', 'informations personnelles', 'vos informations', 'coordonnees'],
  driver: ['conducteur', 'pilote', 'permis'],
  vehicle: ['vehicule', 'voiture', 'automobile', 'immatriculation'],
  insuranceHistory: ['antecedents', 'historique', 'assurance actuelle', 'contrat actuel', 'sinistre', 'sinistres', 'bonus', 'resiliation', 'assureur'],
};

/**
 * Un champ « Nom » ou « Date de naissance » placé dans la section du conducteur est celui du conducteur :
 * ces chemins reprennent les libellés de leur équivalent côté souscripteur, mais seulement dans ce contexte.
 */
export const INHERITED_LABELS: Partial<Record<CanonicalPath, CanonicalPath>> = {
  'driver.firstName': 'client.firstName',
  'driver.lastName': 'client.lastName',
  'driver.birthDate': 'client.birthDate',
  'driver.phone': 'client.phone',
};
