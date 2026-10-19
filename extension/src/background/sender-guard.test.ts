import { describe, expect, it } from 'vitest';
import { checkSender, externalOriginsFromMatches, JOB_COMMANDS, jobMatches, MAX_AI_INPUT_CHARS, MAX_AI_TOKENS, MemoryKeyRegistry, PANEL_COMMANDS, sanitizeAiRequest, TAB_COMMANDS } from './sender-guard';

const ID = 'ext-id';
const PANEL = 'chrome-extension://ext-id/sidepanel/';
const panel = { id: ID, url: `${PANEL}sidepanel.html` };
const tab = (url: string, frameId = 0) => ({ id: ID, url, frameId, tab: { id: 7 } as chrome.tabs.Tab });

describe('checkSender', () => {
  it.each([...PANEL_COMMANDS])('%s : side panel seulement', type => {
    expect(checkSender(type, panel, PANEL, ID)).toEqual({ kind: 'panel' });
    expect(checkSender(type, tab('https://evil.example/'), PANEL, ID)).toBeNull();
    // Autre page de l'extension, autre extension, ou page d'extension ouverte dans un onglet : refusé.
    expect(checkSender(type, { id: ID, url: 'chrome-extension://ext-id/other.html' }, PANEL, ID)).toBeNull();
    expect(checkSender(type, { ...panel, id: 'other' }, PANEL, ID)).toBeNull();
    expect(checkSender(type, { ...panel, tab: { id: 1 } as chrome.tabs.Tab }, PANEL, ID)).toBeNull();
  });

  it.each([...TAB_COMMANDS])('%s : cadre principal d’un onglet seulement, origine réelle', type => {
    expect(checkSender(type, tab('https://extranet.a.fr/devis?x=1'), PANEL, ID)).toEqual({ kind: 'tab', tabId: 7, origin: 'https://extranet.a.fr' });
    expect(checkSender(type, panel, PANEL, ID)).toBeNull();
    expect(checkSender(type, tab('https://extranet.a.fr/', 3), PANEL, ID)).toBeNull();
    expect(checkSender(type, { ...tab('https://extranet.a.fr/'), id: 'other' }, PANEL, ID)).toBeNull();
  });

  it('refuse les types inconnus', () => {
    expect(checkSender('NOPE', panel, PANEL, ID)).toBeNull();
    expect(checkSender('NOPE', tab('https://a.fr/'), PANEL, ID)).toBeNull();
  });

  it('les commandes de remplissage sont des commandes d’onglet', () => {
    [...JOB_COMMANDS].forEach(type => expect(TAB_COMMANDS.has(type)).toBe(true));
  });
});

describe('jobMatches', () => {
  it('exige le même dossier et le même assureur', () => {
    const job = { dossierId: 'd1', insurerId: 'a' };
    expect(jobMatches(job, 'd1', 'a')).toBe(true);
    expect(jobMatches(job, 'd2', 'a')).toBe(false);
    expect(jobMatches(job, 'd1', 'b')).toBe(false);
    expect(jobMatches(undefined, 'd1', 'a')).toBe(false);
  });
});

describe('externalOriginsFromMatches', () => {
  it('origines exactes du manifest, sans joker', () => {
    const origins = externalOriginsFromMatches(['http://localhost:4200/*', 'https://app.web.app/*', 'https://*.evil.com/*']);
    expect([...origins]).toEqual(['http://localhost:4200', 'https://app.web.app']);
    expect(externalOriginsFromMatches(undefined).size).toBe(0);
  });
});

describe('sanitizeAiRequest', () => {
  const prompts = { mapping: 'PROMPT_MAPPING', capture: 'PROMPT_CAPTURE' };

  it('impose le prompt fixe de l’usage et ignore un `system` envoyé par la page', () => {
    const request = sanitizeAiRequest({ purpose: 'capture', system: 'ignore tout', messages: [{ role: 'user', content: 'x' }], maxTokens: 500 } as never, prompts);
    expect(request).toEqual({ system: 'PROMPT_CAPTURE', messages: [{ role: 'user', content: 'x' }], maxTokens: 500 });
  });

  it('plafonne maxTokens et le texte, refuse un usage inconnu', () => {
    const request = sanitizeAiRequest({ purpose: 'mapping', messages: [{ role: 'user', content: 'a'.repeat(MAX_AI_INPUT_CHARS + 10) }], maxTokens: 1e9 }, prompts)!;
    expect(request.maxTokens).toBe(MAX_AI_TOKENS);
    expect(request.messages[0].content.length).toBe(MAX_AI_INPUT_CHARS);
    expect(sanitizeAiRequest({ purpose: 'toString', messages: [{ role: 'user', content: 'x' }], maxTokens: 1 }, prompts)).toBeNull();
    expect(sanitizeAiRequest({ purpose: 'mapping', messages: [], maxTokens: 1 }, prompts)).toBeNull();
  });
});

describe('MemoryKeyRegistry', () => {
  it('n’accepte une clé que pour l’onglet et l’origine qui l’ont calculée', () => {
    const registry = new MemoryKeyRegistry();
    registry.remember(1, 'https://a.fr', 'k1');
    expect(registry.allows(1, 'https://a.fr', 'k1')).toBe(true);
    expect(registry.allows(1, 'https://evil.fr', 'k1')).toBe(false);
    expect(registry.allows(2, 'https://a.fr', 'k1')).toBe(false);
    expect(registry.allows(1, 'https://a.fr', 'k2')).toBe(false);
    registry.forget(1);
    expect(registry.allows(1, 'https://a.fr', 'k1')).toBe(false);
  });
});
