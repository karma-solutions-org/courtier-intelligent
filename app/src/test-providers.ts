import { provideIsoDates } from './app/core/providers/iso-date-adapter';

// Fournisseurs globaux des tests, comme dans app.config.ts (datepickers jj/mm/aaaa).
export default [provideIsoDates()];
