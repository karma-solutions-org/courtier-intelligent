#!/usr/bin/env node
/**
 * Sert les trois extranets de démonstration en même temps (aucune dépendance ajoutée : http-server via npx) :
 *   - Assureur Test (démo locale)        → http://localhost:8090/index.html
 *   - Horizon Assurances (démo locale)   → http://localhost:8091/index.html
 *   - Atlas Mutuelle (démo locale)       → http://localhost:8092/index.html
 * Ctrl+C arrête les trois serveurs.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEMOS = [
  { name: 'Assureur Test', dir: 'demo-extranet', port: 8090 },
  { name: 'Horizon Assurances', dir: 'demo-extranet-horizon', port: 8091 },
  { name: 'Atlas Mutuelle', dir: 'demo-extranet-atlas', port: 8092 },
];

const children = DEMOS.map(demo => {
  // Commande fixe (aucune saisie de l'utilisateur) : passée au shell, car sous Windows npx est un script (npx.cmd).
  const child = spawn(`npx --yes http-server@14.1.1 ${demo.dir} -p ${demo.port} -c-1 --silent`, { cwd: root, stdio: 'inherit', shell: true });
  child.on('exit', code => {
    if (code) console.error(`${demo.name} (port ${demo.port}) s'est arrêté (code ${code}).`);
  });
  return child;
});

for (const demo of DEMOS) console.log(`${demo.name} (démo locale) : http://localhost:${demo.port}/index.html`);
console.log('Ctrl+C pour tout arrêter.');

const stop = () => {
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // Sous Windows, tuer le shell ne suffit pas : on arrête aussi le serveur qu'il a lancé.
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 300);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
