import { CanonicalData, CanonicalPath, OcrField, QuestionnaireSection } from '@shared';
import { mergeOcrFields, needsConfirmation } from './documents.utils';

/** Section affichée, bornée au questionnaire (la reprise peut venir d'un ancien enregistrement). */
export function boundedSectionIndex(index: number, sectionCount: number): number {
  return Math.min(index, Math.max(0, sectionCount - 1));
}

/** Champs obligatoires encore vides de la section affichée : « Suivant » reste bloqué tant qu'il y en a. */
export function missingInSection(sections: QuestionnaireSection[], missing: CanonicalPath[]): CanonicalPath[] {
  const paths = new Set(sections.flatMap((section) => section.questions).map((question) => question.canonicalPath));
  return missing.filter((path) => paths.has(path));
}

/**
 * Valeurs lues dans les pièces du client à écrire dans le dossier : seulement les valeurs sûres (confiance suffisante),
 * seulement dans les champs encore VIDES (rien de ce que le courtier a saisi n'est écrasé), et seulement pour les questions
 * du dossier (une question `extra.*` d'un extranet non choisi serait refusée par le serveur).
 */
export function clientPieceAnswers(fields: OcrField[], answers: CanonicalData, sections: QuestionnaireSection[]): OcrField[] {
  const paths = new Set(sections.flatMap((section) => section.questions).map((question) => question.canonicalPath));
  const isEmpty = (path: CanonicalPath) => answers[path] === undefined || answers[path] === null || answers[path] === '';
  return mergeOcrFields(fields).filter(
    (field) => paths.has(field.canonicalPath) && !needsConfirmation(field) && isEmpty(field.canonicalPath),
  );
}
