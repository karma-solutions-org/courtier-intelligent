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
// Build de développement (localhost autorisé, sourcemaps) : uniquement sur demande explicite.
// Sans option, le build est celui de production : c'est ce qui part au Chrome Web Store, la sécurité est le défaut.
// `--demo` : vrai projet Firebase de test, faux extranets sur localhost:8090-8094 ; `--emulators` l'implique aussi.
const isDev = useEmulators || process.argv.includes('--dev') || process.argv.includes('--demo');
const allowLocalhost = isDev;

const isLocalhost = pattern => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//i.test(pattern);

/**
 * Manifest du build. L'accès aux extranets (`https://*\/*`) reste toujours optionnel : il est demandé au courtier,
 * assureur par assureur, depuis le side panel. Les entrées localhost du source :
 * - en production, sont retirées de `externally_connectable.matches` et des permissions (le service worker lit la
 *   liste via getManifest()) ;
 * - en développement, `http://localhost/*` est accordé d'office (host_permissions) pour tester les démos sans clic.
 */
function buildManifest() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const optional = manifest.optional_host_permissions ?? [];
  if (allowLocalhost) {
    const local = optional.filter(isLocalhost);
    manifest.optional_host_permissions = optional.filter(p => !isLocalhost(p));
    if (local.length) manifest.host_permissions = [...(manifest.host_permissions ?? []), ...local];
  } else {
    if (manifest.externally_connectable?.matches) {
      manifest.externally_connectable.matches = manifest.externally_connectable.matches.filter(p => !isLocalhost(p));
    }
    manifest.optional_host_permissions = optional.filter(p => !isLocalhost(p));
    if (manifest.host_permissions) {
      manifest.host_permissions = manifest.host_permissions.filter(p => !isLocalhost(p));
      if (!manifest.host_permissions.length) delete manifest.host_permissions;
    }
  }
  return manifest;
}

function copyStatic() {
  fs.mkdirSync(path.join(dist, 'sidepanel'), { recursive: true });
  fs.mkdirSync(path.join(dist, 'content'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify(buildManifest(), null, 2) + '\n');
  for (const file of ['sidepanel.html', 'sidepanel.css']) {
    fs.copyFileSync(path.join(root, 'src/sidepanel', file), path.join(dist, 'sidepanel', file));
  }
  fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
}

const common = {
  bundle: true,
  target: 'es2022',
  // Pas de sourcemaps dans le paquet publié.
  sourcemap: isDev,
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
console.log(isDev ? 'Build de DÉVELOPPEMENT (localhost autorisé) : ne pas publier.' : 'Build de production.');
