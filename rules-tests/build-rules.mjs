// Wraps the fragment firestore.courtier-intelligent.rules into a complete rules file.
// The fragment relies on two helpers defined by the shared database's rules (isConnected, onlyChangedKeys):
// they are provided here with their expected semantics.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fragment = readFileSync(resolve(here, '../firestore.courtier-intelligent.rules'), 'utf8');
const out = resolve(here, 'generated/firestore.rules');

const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ── Helpers of the shared database (not part of the fragment) ──
    function isConnected() {
      return request.auth != null;
    }
    function onlyChangedKeys(keys) {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly(keys);
    }

${fragment}

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, rules);
console.log('Rules written to', out);
