import {
  CanonicalData,
  Insurer,
  isAnswered,
  isQuestionVisible,
  Question,
  QuestionnaireSection,
  questionsOf,
  schemaWithComplements,
  withAddedComplements,
} from '@shared';

/** Ce qu'il faut pour recalculer le questionnaire d'un dossier en tarification quand on lui ajoute des assureurs. */
export interface InsurerAdditionContext {
  /** Questionnaire figé du dossier (`questionnaireSnapshot`), à défaut le questionnaire calculé. */
  frozenSchema: QuestionnaireSection[];
  /** Questionnaire complet du produit (catalogue). */
  productSchema: QuestionnaireSection[];
  productId: string;
  /** Questions apprises des parcours, par assureur (`product.insurerQuestions`). */
  learned: Record<string, string[]>;
  /** Assureurs déjà choisis pour le dossier. */
  currentInsurers: Insurer[];
}

/**
 * Questions que l'ajout des assureurs `added` ajoute au questionnaire figé (même calcul que le serveur :
 * `schemaWithComplements` puis `withAddedComplements`), avec leur définition (donc leur caractère obligatoire).
 */
export function addedComplementQuestions(context: InsurerAdditionContext, added: Insurer[]): Question[] {
  if (!added.length) return [];
  const fresh = schemaWithComplements(
    context.productSchema,
    [...context.currentInsurers, ...added],
    context.productId,
    context.learned,
  );
  const { schema, added: paths } = withAddedComplements(context.frozenSchema, fresh);
  const addedPaths = new Set<string>(paths);
  return questionsOf(schema).filter((question) => addedPaths.has(question.canonicalPath));
}

/**
 * Parmi les questions ajoutées, celles à poser avant l'ajout : obligatoires, visibles (selon les réponses du dossier et
 * celles déjà saisies dans la boîte de dialogue) et sans réponse dans le dossier.
 */
export function questionsToAsk(questions: Question[], dossierAnswers: CanonicalData, answers: CanonicalData): Question[] {
  return questions.filter(
    (question) =>
      question.required &&
      isQuestionVisible(question, answers) &&
      !isAnswered(dossierAnswers[question.canonicalPath], question),
  );
}
