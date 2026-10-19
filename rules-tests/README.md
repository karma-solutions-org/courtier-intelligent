# Firestore rules tests

Automated tests for `../firestore.courtier-intelligent.rules` (a fragment pasted into the shared database rules).

## Requirements
- Node 18+, Java 11+ (Firestore emulator), firebase-tools (`npm i -g firebase-tools`).

## Run
```
cd rules-tests
npm install
npm test
```
`npm test` runs `build-rules.mjs`, which wraps the fragment into `generated/firestore.rules`
(`rules_version = '2'`, the shared helpers `isConnected()` / `onlyChangedKeys()`, and a deny-all catch-all), then starts the
Firestore emulator with `../firebase.rules-test.json` (port 8085, demo project) and runs `vitest run`.

Tests (`test/rules.test.mjs`) seed cabinets, members (sessions with app/extension `auth_time`), dossiers, jobs, offers and
documents with rules disabled, then mirror real payloads from the app (`AssuresService`, `session.service`) and the
extension (`jobs-service.ts`: `updateJob`, `writeCapturedOffer`, `addExtensionReport`).

If the emulator port is busy after an interrupted run, kill the leftover `java` process listening on 8085.
