import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dossier, Insurer, OPTIONAL_SECTION_TITLE, Product, QuestionnaireSection } from '@shared';
import { BehaviorSubject, of } from 'rxjs';
import { AuthStore } from '../../../../commons/authentication-module/store/auth.store';
import { CabinetStatusStore } from '../../../../commons/main-module/store/cabinet-status.store';
import { DocumentsService } from '../../services/documents.service';
import { DossiersService } from '../../services/dossiers.service';
import { DossierStore } from '../dossier.store';

/** Catalogue en deux niveaux : un socle (`core`) et des compléments. */
const PRODUCT = {
  id: 'auto',
  name: 'Auto',
  active: true,
  guaranteeCatalog: [],
  questionnaireSchema: [
    {
      title: 'Conducteur',
      questions: [
        { canonicalPath: 'driver.lastName', label: 'Nom', type: 'text', required: true, core: true },
        { canonicalPath: 'driver.birthCountry', label: 'Pays de naissance', type: 'text', required: true },
      ],
    },
    {
      title: 'Véhicule',
      questions: [
        { canonicalPath: 'vehicle.registration', label: 'Immatriculation', type: 'text', required: true, core: true },
        { canonicalPath: 'vehicle.model', label: 'Modèle', type: 'text', required: true },
      ],
    },
  ],
} as unknown as Product;

const OYAT = { id: 'oyat', name: 'Oyat', questions: { auto: ['vehicle.model'] } } as unknown as Insurer;
const UNKNOWN = { id: 'inconnu', name: 'Assureur inconnu' } as unknown as Insurer;

const paths = (schema: QuestionnaireSection[]) => schema.flatMap((section) => section.questions.map((q) => q.canonicalPath));

/** Tests du questionnaire calculé par `withDossierDerived` (schemaWithComplements), avec un faux service. */
describe('DossierStore — questionnaire en deux niveaux', () => {
  let store: InstanceType<typeof DossierStore>;

  function open(insurerIds: string[]) {
    const dossier = { id: 'd1', productId: 'auto', status: 'brouillon', data: {}, insurerIds } as unknown as Dossier;
    TestBed.configureTestingModule({
      providers: [
        DossierStore,
        { provide: CabinetStatusStore, useValue: { cabinet: signal(null) } },
        {
          provide: DossiersService,
          useValue: {
            watchDossier: () => new BehaviorSubject<Dossier | null>(dossier),
            watchEvents: () => of({ events: [], hasMore: false }),
            watchProducts: () => of([PRODUCT]),
            watchInsurers: () => of([OYAT, UNKNOWN]),
            watchMembers: () => of([]),
            watchAssure: () => of(null),
          },
        },
        { provide: AuthStore, useValue: { cabinetId: signal('c1'), user: signal({ uid: 'u1' }) } },
        { provide: DocumentsService, useValue: {} },
      ],
    });
    store = TestBed.inject(DossierStore);
    store.select('d1');
    TestBed.tick();
  }

  it('un assureur sans liste connue ne reçoit que le socle, les autres questions étant facultatives', () => {
    open(['inconnu']);

    const schema = store.schema();
    expect(paths(schema.filter((section) => !section.optional))).toEqual(['driver.lastName', 'vehicle.registration']);
    const optional = schema.at(-1)!;
    expect(optional).toMatchObject({ title: OPTIONAL_SECTION_TITLE, optional: true });
    expect(paths([optional])).toEqual(['driver.birthCountry', 'vehicle.model']);
    expect(optional.questions.every((question) => !question.required)).toBe(true);
  });

  it('les questions facultatives ne bloquent pas la complétude', () => {
    open(['inconnu']);
    store.edit('driver.lastName', 'Martin');
    store.edit('vehicle.registration', 'AB-123-CD');

    expect(store.missing()).toEqual([]);
    expect(store.isComplete()).toBe(true);
  });

  it("un complément demandé par un extranet choisi reste posé (et obligatoire), hors section facultative", () => {
    open(['oyat']);

    const schema = store.schema();
    expect(paths(schema.filter((section) => !section.optional))).toEqual([
      'driver.lastName',
      'vehicle.registration',
      'vehicle.model',
    ]);
    expect(paths(schema.filter((section) => section.optional))).toEqual(['driver.birthCountry']);
    expect(store.missing()).toContain('vehicle.model');
  });
});
