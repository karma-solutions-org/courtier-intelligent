import { AbstractControl, ValidationErrors } from '@angular/forms';
import { Assure } from '@shared';

/** Formats acceptés (France). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_PATTERN = /^(?:(?:\+|00)33\s?|0)[1-9](?:[\s.-]?\d{2}){4}$/;
export const POSTAL_CODE_PATTERN = /^\d{5}$/;
const SIRET_PATTERN = /^\d{14}$/;
const MIN_BIRTH_YEAR = 1900;

/** Un champ vide est valide (les champs obligatoires ont leur propre validateur). */
const optional =
  (isValid: (value: string) => boolean) =>
  (control: AbstractControl): boolean => {
    const value = String(control.value ?? '').trim();
    return !value || isValid(value);
  };

export const phoneValidator = (control: AbstractControl): ValidationErrors | null =>
  optional(value => PHONE_PATTERN.test(value))(control) ? null : { phone: true };

export const siretValidator = (control: AbstractControl): ValidationErrors | null =>
  optional(value => SIRET_PATTERN.test(value.replace(/\s/g, '')))(control) ? null : { siret: true };

/** Date de naissance (AAAA-MM-JJ) plausible : ni dans le futur, ni avant 1900. */
export const birthDateValidator = (control: AbstractControl): ValidationErrors | null =>
  optional(value => {
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && date <= new Date() && date.getFullYear() >= MIN_BIRTH_YEAR;
  })(control)
    ? null
    : { birthDate: true };

/** Minuscules, sans accents ni espaces superflus : base des comparaisons (recherche, doublons). */
export function normalize(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nom affiché : raison sociale d'un professionnel, sinon « Prénom NOM ». */
export function displayName(assure: Pick<Assure, 'type' | 'firstName' | 'lastName' | 'companyName'>): string {
  if (assure.type === 'pro' && assure.companyName) {
    return assure.companyName;
  }
  return `${assure.firstName} ${assure.lastName}`.trim();
}

/** Tous les mots de la recherche doivent se retrouver (nom, société, email, téléphone, ville). */
export function matchesSearch(assure: Assure, query: string): boolean {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) {
    return true;
  }
  const haystack = normalize(
    [
      assure.firstName,
      assure.lastName,
      assure.companyName,
      assure.email,
      assure.phone,
      assure.address?.city,
      assure.address?.postalCode,
    ].join(' '),
  );
  // Un numéro se cherche avec ou sans espaces, points et tirets.
  const compact = haystack.replace(/[\s.-]/g, '');
  return words.every(word => haystack.includes(word) || compact.includes(word.replace(/[\s.-]/g, '')));
}

export interface DuplicateCandidate {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
}

/**
 * Assurés qui ressemblent au candidat : même email, ou même nom, prénom et date de naissance.
 * `excludeId` écarte l'assuré en cours de modification.
 */
export function findDuplicates(candidate: DuplicateCandidate, assures: Assure[], excludeId?: string): Assure[] {
  const email = normalize(candidate.email);
  const identity = [candidate.lastName, candidate.firstName].map(normalize).join('|');
  const hasIdentity = !!normalize(candidate.lastName) && !!normalize(candidate.firstName) && !!candidate.birthDate;

  return assures.filter(assure => {
    if (assure.id === excludeId) {
      return false;
    }
    const sameEmail = !!email && normalize(assure.email) === email;
    const sameIdentity =
      hasIdentity &&
      assure.birthDate === candidate.birthDate &&
      [assure.lastName, assure.firstName].map(normalize).join('|') === identity;
    return sameEmail || sameIdentity;
  });
}
