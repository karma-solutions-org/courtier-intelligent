#!/usr/bin/env node
// Crée le dossier d'un nouvel extranet : engine/extranets/<insurerId>/{adapter,fixture,journey.test}.ts, et
// l'enregistre dans engine/extranets/registry.ts. Usage : npm run extranet:new -- <insurerId> <domaine>
// Ex. : npm run extranet:new -- oyat oyat-assurances.fr
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [insurerId, host] = process.argv.slice(2);
const fail = message => {
  console.error(`✗ ${message}`);
  process.exit(1);
};
if (!insurerId || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(insurerId)) fail('Identifiant d’assureur attendu, tel que dans ci_insurers (ex. oyat, solly-azar).');
if (!host || !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host)) fail('Domaine de l’extranet attendu, sans https ni chemin (ex. oyat-assurances.fr).');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'engine', 'extranets');
const folder = join(root, insurerId);
if (existsSync(folder)) fail(`engine/extranets/${insurerId}/ existe déjà.`);

const camel = insurerId.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
const constant = insurerId.toUpperCase().replace(/-/g, '_');
const adapterName = `${camel}Adapter`;

const files = {
  'adapter.ts': `import type { ExtranetAdapter } from '../adapter';
import { genericAdapter } from '../generic';

/**
 * ${pascal} (${host}). Ne redéfinir ici que ce que l'extranet fait autrement que le comportement générique
 * (voir les points d'extension dans ../adapter.ts), chaque règle commentée avec le HTML réel qui la justifie.
 */
export const ${adapterName}: ExtranetAdapter = {
  ...genericAdapter,
  id: '${insurerId}',
};
`,
  'fixture.ts': `import { RESULT_TABLE } from '../../__fixtures__/resultats';
import { mountExtranet, type ExtranetSimulator, type SimulatedPage } from '../testing/simulator';

/**
 * ${pascal} : pages du parcours de devis, reconstituées à partir du HTML RÉEL de l'extranet (copié depuis la console
 * du navigateur, données client remplacées). Une page par étape, dans l'ordre ; la dernière affiche le tarif.
 */
export const ${constant}_ORIGIN = 'https://${host}';

const NEXT = '<button type="button" class="next">Suivant</button>';

export const ${constant}_PAGES: SimulatedPage[] = [
  // { name: 'vehicule', html: \`…HTML relevé sur l'extranet…\` },
  { name: 'tarifs', html: RESULT_TABLE },
];

export const mount${pascal} = (doc: Document): ExtranetSimulator =>
  mountExtranet(doc, { pages: ${constant}_PAGES, nextButton: NEXT, nextSelector: '.next' });
`,
  'journey.test.ts': `import { describe, it } from 'vitest';

/**
 * PARCOURS ${pascal.toUpperCase()} jusqu'au tarif, sur le modèle de ../zephir/journey.test.ts : à écrire dès que les pages
 * réelles sont relevées dans fixture.ts. Tant qu'il n'est pas écrit, il apparaît « todo » dans npm test.
 */
describe('PARCOURS ${pascal.toUpperCase()} : devis complet jusqu’au tarif', () => {
  it.todo('remplit chaque page et lit le tarif');
});
`,
};

mkdirSync(folder);
for (const [name, content] of Object.entries(files)) writeFileSync(join(folder, name), content);

// Enregistrement : import + ligne au-dessus du repère.
const registryPath = join(root, 'registry.ts');
let registry = readFileSync(registryPath, 'utf8');
const marker = '  // extranet:new';
if (!registry.includes(marker)) fail('Repère « // extranet:new » introuvable dans registry.ts.');
const lines = registry.split('\n');
const lastImport = lines.map(line => line.startsWith('import ')).lastIndexOf(true);
lines.splice(lastImport + 1, 0, `import { ${adapterName} } from './${insurerId}/adapter';`);
registry = lines.join('\n').replace(marker, `  { insurerId: '${insurerId}', hosts: ['${host}'], adapter: ${adapterName} },\n${marker}`);
writeFileSync(registryPath, registry);

console.log(`✓ engine/extranets/${insurerId}/ créé et enregistré.
  1. Relevez le HTML réel de chaque page dans fixture.ts (une entrée par étape).
  2. Écrivez journey.test.ts sur le modèle de zephir/journey.test.ts.
  3. Ne mettez dans adapter.ts que ce qui diffère du générique.
  4. npm test : le parcours Zephir doit rester vert.`);
