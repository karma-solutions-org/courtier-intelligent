// Construit l'extension dans dist/ : ce dossier se charge tel quel dans Chrome
// (chrome://extensions → Mode développeur → Charger l'extension non empaquetée).
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const isWatch = process.argv.includes('--watch');
// `--emulators` : l'extension vise les emulators Firebase locaux (auth 9099, firestore 8080, functions 5001).
const useEmulators = process.argv.includes('--emulators');
// `--demo` : vrai projet Firebase de test, mais localhost autorisé (app sur localhost:4200, faux extranet sur localhost:8090).
const allowLocalhost = useEmulators || process.argv.includes('--demo');

const isLocalhost = pattern => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//i.test(pattern);

/**
 * Manifest du build : le source garde les entrées localhost (développement) ; hors `--emulators` et `--demo`, elles sont retirées
 * de `externally_connectable.matches` et `host_permissions` (le service worker lit la liste via getManifest()).
 */
function buildManifest() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (!allowLocalhost) {
    if (manifest.externally_connectable?.matches) {
      manifest.externally_connectable.matches = manifest.externally_connectable.matches.filter(p => !isLocalhost(p));
    }
    if (manifest.host_permissions) {
      manifest.host_permissions = manifest.host_permissions.filter(p => !isLocalhost(p));
    }
  }
  return manifest;
}

function copyStatic() {
  fs.mkdirSync(path.join(dist, 'sidepanel'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify(buildManifest(), null, 2) + '\n');
  for (const file of ['sidepanel.html', 'sidepanel.css']) {
    fs.copyFileSync(path.join(root, 'src/sidepanel', file), path.join(dist, 'sidepanel', file));
  }
  fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
}

const common = {
  bundle: true,
  target: 'es2022',
  sourcemap: true,
  platform: 'browser',
  logLevel: 'info',
  define: { __USE_EMULATORS__: String(useEmulators), __ALLOW_LOCALHOST__: String(allowLocalhost) },
};

const builds = [
  // Le service worker MV3 est déclaré en "type": "module".
  { ...common, entryPoints: ['src/background/service-worker.ts'], outfile: 'dist/background/service-worker.js', format: 'esm' },
  { ...common, entryPoints: ['src/sidepanel/sidepanel.ts'], outfile: 'dist/sidepanel/sidepanel.js', format: 'esm' },
  // Les content scripts ne supportent pas les modules ES.
  { ...common, entryPoints: ['src/content/content-script.ts'], outfile: 'dist/content/content-script.js', format: 'iife' },
];

fs.rmSync(dist, { recursive: true, force: true });
copyStatic();

if (isWatch) {
  for (const options of builds) {
    await (await esbuild.context(options)).watch();
  }
  console.log('En attente de modifications…');
} else {
  await Promise.all(builds.map(options => esbuild.build(options)));
}
