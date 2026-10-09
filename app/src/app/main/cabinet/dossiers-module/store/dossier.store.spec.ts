import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dossier, Product } from '@shared';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AuthStore } from '../../../commons/authentication-module/store/auth.store';
import { DossiersService } from '../services/dossiers.service';
import { DossierStore } from './dossier.store';

const PRODUCT = {
  id: 'auto',
  name: 'Auto',
  active: true,
  guaranteeCatalog: [],
  questionnaireSchema: [
    {
      title: 'Véhicule',
      questions: [
        { canonicalPath: 'vehicle.registration', label: 'Immatriculation', type: 'text', required: true },
        { canonicalPath: 'vehicle.fiscalPower', label: 'Puissance fiscale', type: 'number', required: true },
      ],
    },
    {
      title: 'Historique',
      questions: [{ canonicalPath: 'insuranceHistory.claimsCount', label: 'Sinistres', type: 'number', required: false, withKnowledge: true }],
    },
  ],
} as Product;

const dossier = (overrides: Partial<Dossier> = {}): Dossier =>
  ({
    id: 'd1',
    reference: '2026-000001',
    assureId: 'a1',
    productId: 'auto',
    assignedTo: 'u1',
    status: 'brouillon',
    data: { 'vehicle.registration': 'AB-123-CD' },
    completeness: { ok: false, missing: ['vehicle.fiscalPower'] },
    draft: { sectionIndex: 1 },
    ...overrides,
  }) as Dossier;

const SAVE_RESULT = { status: 'brouillon', completeness: { ok: false, missing: [] } };

describe('DossierStore', () => {
  let dossier$: BehaviorSubject<Dossier | null>;
  let service: {
    save: ReturnType<typeof vi.fn>;
    changeStatus: ReturnType<typeof vi.fn>;
    assign: ReturnType<typeof vi.fn>;
    saveNeed: ReturnType<typeof vi.fn>;
    validateNeed: ReturnType<typeof vi.fn>;
  };
  let store: InstanceType<typeof DossierStore>;

  /** Laisse passer le délai de sauvegarde automatique. */
  const typingStops = async () => {
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(1000);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    dossier$ = new BehaviorSubject<Dossier | null>(dossier());
    service = {
      save: vi.fn(() => of(SAVE_RESULT)),
      changeStatus: vi.fn(() => of({ status: 'complet' })),
      assign: vi.fn(() => of({ success: true })),
      saveNeed: vi.fn(() => of({ status: 'complet', changed: ['budgetMax'] })),
      validateNeed: vi.fn(() => of({ status: 'besoin_valide' })),
    };
    TestBed.configureTestingModule({
      providers: [
        DossierStore,
        {
          provide: DossiersService,
          useValue: {
            ...service,
            watchDossier: () => dossier$,
            watchEvents: () => of([]),
            watchProducts: () => of([PRODUCT]),
            watchInsurers: () => of([]),
            watchMembers: () => of([]),
            watchAssure: () => of(null),
          },
        },
        { provide: AuthStore, useValue: { cabinetId: signal('c1'), user: signal({ uid: 'u1' }) } },
      ],
    });
    store = TestBed.inject(DossierStore);
    store.select('d1');
    TestBed.tick();
  });

  afterEach(() => vi.useRealTimers());

  describe('Reprise du brouillon', () => {
    it('restaure les réponses et la section où le courtier s’était arrêté', () => {
      expect(store.answers()).toEqual({ 'vehicle.registration': 'AB-123-CD' });
      expect(store.sectionIndex()).toBe(1);
      expect(store.schema()).toHaveLength(2);
    });

    it('un dossier sans reprise enregistrée démarre à la première section', () => {
      dossier$.next(null);
      store.select('d2');
      dossier$.next(dossier({ id: 'd2', draft: null }));
      TestBed.tick();

      expect(store.sectionIndex()).toBe(0);
    });

    it('les mises à jour du serveur n’écrasent pas la saisie en cours', () => {
      store.edit('vehicle.fiscalPower', 5);
      dossier$.next(dossier({ status: 'brouillon', data: { 'vehicle.registration': 'AB-123-CD' } }));

      expect(store.answers()['vehicle.fiscalPower']).toBe(5);
    });
  });

  describe('Sauvegarde automatique', () => {
    it('affiche la réponse aussitôt et l’enregistre quand la frappe s’arrête', async () => {
      store.edit('vehicle.fiscalPower', 5);

      expect(store.answers()['vehicle.fiscalPower']).toBe(5);
      expect(store.saveStatus()).toBe('dirty');
      expect(service.save).not.toHaveBeenCalled();

      await typingStops();

      expect(service.save).toHaveBeenCalledExactlyOnceWith('d1', { 'vehicle.fiscalPower': 5 }, {});
      expect(store.saveStatus()).toBe('saved');
    });

    it('regroupe plusieurs frappes rapprochées en un seul enregistrement', async () => {
      store.edit('vehicle.registration', 'A');
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(300);
      store.edit('vehicle.registration', 'AB');
      store.edit('vehicle.fiscalPower', 7);
      await typingStops();

      expect(service.save).toHaveBeenCalledOnce();
      expect(service.save.mock.calls[0][1]).toEqual({ 'vehicle.registration': 'AB', 'vehicle.fiscalPower': 7 });
    });

    it('conserve null et 0 (effacer ≠ répondre zéro)', async () => {
      store.edit('vehicle.registration', null);
      store.edit('vehicle.fiscalPower', 0);
      await typingStops();

      expect(service.save.mock.calls[0][1]).toEqual({ 'vehicle.registration': null, 'vehicle.fiscalPower': 0 });
    });

    it('en cas d’échec, garde les réponses et les renvoie à l’enregistrement suivant', async () => {
      service.save.mockReturnValueOnce(throwError(() => ({ code: 'functions/unavailable' })));
      store.edit('vehicle.fiscalPower', 5);
      await typingStops();

      expect(store.saveStatus()).toBe('error');
      expect(store.error()).toBeTruthy();

      store.edit('vehicle.registration', 'ZZ');
      await typingStops();

      expect(service.save).toHaveBeenCalledTimes(2);
      expect(service.save.mock.calls[1][1]).toEqual({ 'vehicle.fiscalPower': 5, 'vehicle.registration': 'ZZ' });
      expect(store.saveStatus()).toBe('saved');
    });

    it('n’enregistre pas à la frappe quand la sauvegarde automatique est désactivée (fiche du dossier)', async () => {
      store.setAutosave(false);
      store.edit('vehicle.fiscalPower', 5);
      await typingStops();

      expect(service.save).not.toHaveBeenCalled();

      store.saveNow({ event: true });
      expect(service.save).toHaveBeenCalledExactlyOnceWith('d1', { 'vehicle.fiscalPower': 5 }, { event: true });
    });

    it('mémorise la section quand le courtier change de page, même sans nouvelle réponse', () => {
      store.goToSection(0);

      expect(store.sectionIndex()).toBe(0);
      expect(service.save).toHaveBeenCalledExactlyOnceWith('d1', {}, { sectionIndex: 0 });
    });
  });

  describe('Complétude', () => {
    it('liste les champs obligatoires manquants, à chaque frappe', () => {
      expect(store.missing()).toEqual(['vehicle.fiscalPower']);
      expect(store.isComplete()).toBe(false);

      store.edit('vehicle.fiscalPower', 0);

      expect(store.missing()).toEqual([]);
      expect(store.isComplete()).toBe(true);
    });

    it('un champ effacé redevient manquant', () => {
      store.edit('vehicle.registration', null);

      expect(store.missing()).toContain('vehicle.registration');
    });
  });

  describe('Statut', () => {
    it('enregistre les réponses en attente avant de changer le statut', () => {
      store.edit('vehicle.fiscalPower', 5);
      store.changeStatus('complet');

      expect(service.save).toHaveBeenCalledOnce();
      expect(service.changeStatus).toHaveBeenCalledExactlyOnceWith('d1', 'complet');
      expect(service.save.mock.invocationCallOrder[0]).toBeLessThan(service.changeStatus.mock.invocationCallOrder[0]);
    });

    it('ne change pas le statut si l’enregistrement des réponses a échoué', () => {
      service.save.mockReturnValueOnce(throwError(() => ({ message: 'Hors ligne' })));
      store.edit('vehicle.fiscalPower', 5);
      store.changeStatus('complet');

      expect(service.changeStatus).not.toHaveBeenCalled();
      expect(store.error()).toBe('Hors ligne');
    });

    it('affiche le refus du serveur (ex. dossier incomplet)', () => {
      service.changeStatus.mockReturnValueOnce(throwError(() => ({ message: 'Le dossier est incomplet : 1 champ(s) obligatoire(s) manquant(s).' })));
      store.changeStatus('complet');

      expect(store.error()).toContain('incomplet');
    });

    it('propose les transitions manuelles autorisées par la machine à états', () => {
      expect(store.transitions()).toEqual(['complet', 'sans_suite']);
      dossier$.next(dossier({ status: 'sans_suite' }));

      expect(store.transitions()).toEqual([]);
      expect(store.editable()).toBe(false);
    });
  });

  describe('Assignation', () => {
    it('réassigne le dossier à un membre', () => {
      store.assign('u2');

      expect(service.assign).toHaveBeenCalledExactlyOnceWith('d1', 'u2');
      expect(store.successMessage()).toBeTruthy();
    });

    it('affiche le refus du serveur', () => {
      service.assign.mockReturnValueOnce(throwError(() => ({ message: 'Ce membre n’est pas actif dans le cabinet.' })));
      store.assign('u2');

      expect(store.error()).toBe('Ce membre n’est pas actif dans le cabinet.');
    });
  });

  describe('quoteData', () => {
    it('est construit depuis les réponses locales, avec null et niveau de connaissance respectés', () => {
      store.edit('vehicle.fiscalPower', 0);
      store.edit('insuranceHistory.claimsCount', { value: null, knowledge: 'DECLARED_UNKNOWN' });

      expect(store.quoteData()).toEqual({
        'vehicle.registration': 'AB-123-CD',
        'vehicle.fiscalPower': 0,
        'insuranceHistory.claimsCount': { value: null, knowledge: 'DECLARED_UNKNOWN' },
      });
    });

    it('un champ jamais renseigné vaut null, pas une valeur inventée', () => {
      expect(store.quoteData()['vehicle.fiscalPower']).toBeNull();
      expect(store.quoteData()['insuranceHistory.claimsCount']).toEqual({ value: null, knowledge: 'UNKNOWN' });
    });
  });

  describe('Analyse du besoin', () => {
    const need = { coverageLevel: 'tiers', budgetMax: 0, maxDeductible: null, mandatoryGuarantees: ['RC'], niceToHave: [], notes: null } as const;

    it('n’est ouverte qu’à un dossier complet ou au besoin validé', () => {
      expect(store.needEditable()).toBe(false);
      dossier$.next(dossier({ status: 'complet' }));
      expect(store.needEditable()).toBe(true);
      dossier$.next(dossier({ status: 'besoin_valide' }));
      expect(store.needEditable()).toBe(true);
      dossier$.next(dossier({ status: 'tarification' }));
      expect(store.needEditable()).toBe(false);
    });

    it('enregistre le besoin, après avoir enregistré les réponses en attente', () => {
      store.edit('vehicle.fiscalPower', 5);
      store.saveNeed({ ...need, mandatoryGuarantees: ['RC'], niceToHave: [] });

      expect(service.saveNeed).toHaveBeenCalledOnce();
      expect(service.save.mock.invocationCallOrder[0]).toBeLessThan(service.saveNeed.mock.invocationCallOrder[0]);
      expect(store.successMessage()).toBe('Besoin enregistré.');
    });

    it('n’enregistre pas le besoin si les réponses en attente n’ont pas pu l’être', () => {
      service.save.mockReturnValueOnce(throwError(() => ({ message: 'Hors ligne' })));
      store.edit('vehicle.fiscalPower', 5);
      store.saveNeed({ ...need, mandatoryGuarantees: [], niceToHave: [] });

      expect(service.saveNeed).not.toHaveBeenCalled();
      expect(store.error()).toBe('Hors ligne');
    });

    it('signale quand rien n’a changé', () => {
      service.saveNeed.mockReturnValueOnce(of({ status: 'complet', changed: [] }));
      store.saveNeed({ ...need, mandatoryGuarantees: [], niceToHave: [] });

      expect(store.successMessage()).toBe('Aucune modification.');
    });

    it('affiche le refus du serveur', () => {
      service.saveNeed.mockReturnValueOnce(throwError(() => ({ message: 'Niveau de couverture invalide.' })));
      store.saveNeed({ ...need, mandatoryGuarantees: [], niceToHave: [] });

      expect(store.error()).toBe('Niveau de couverture invalide.');
    });

    it('valide le besoin', () => {
      store.validateNeed();

      expect(service.validateNeed).toHaveBeenCalledExactlyOnceWith('d1');
      expect(store.successMessage()).toBe('Besoin validé.');
    });

    it('affiche le refus de validation du serveur', () => {
      service.validateNeed.mockReturnValueOnce(throwError(() => ({ message: 'Choisissez et enregistrez un niveau de couverture avant de valider le besoin.' })));
      store.validateNeed();

      expect(store.error()).toContain('niveau de couverture');
    });

    it('suggère un besoin d’après les réponses du questionnaire, sans budget ni franchise', () => {
      store.edit('vehicle.firstRegistrationDate', `${new Date().getFullYear() - 1}-01-01`);
      const suggestion = store.needSuggestion();

      expect(suggestion.coverageLevel).toBe('tous_risques');
      expect(suggestion.mandatoryGuarantees).toEqual([]); // le produit de test n'a pas de référentiel de garanties
      expect(suggestion).not.toHaveProperty('budgetMax');
    });
  });
});
