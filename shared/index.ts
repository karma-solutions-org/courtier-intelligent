// Types partagés entre l'app Angular, l'extension Chrome et les Cloud Functions.
// Le backend (repo courtier-intelligent-back) en garde une copie synchronisée :
// après toute modification ici, lancer `npm run sync-shared` dans courtier-intelligent-back/functions.
export * from './canonical-paths';
export * from './statuses';
export * from './models';
export * from './limits';
export * from './questionnaire';
export * from './need';
export * from './pricing';
export * from './comparison';
export * from './documents';
export * from './proposal';
export * from './assure-format';
