import { TestBed } from '@angular/core/testing';
import { DossierEvent } from '@shared';
import { DossierTimelinePresentationComponent } from './dossier-timeline-presentation.component';

const statusChange = (from: string, to: string, automatic = true) =>
  ({ id: `${from}-${to}`, type: 'status_changed', by: 'u1', data: { from, to, automatic } }) as unknown as DossierEvent;

/** Texte affiché par l'historique pour une liste d'événements. */
function render(events: DossierEvent[]): string {
  const fixture = TestBed.createComponent(DossierTimelinePresentationComponent);
  fixture.componentRef.setInput('events', events);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('DossierTimelinePresentationComponent', () => {
  describe('changement de statut automatique', () => {
    it("n'explique pas le passage normal en tarification par une information retirée", () => {
      const text = render([statusChange('besoin_valide', 'tarification')]);

      expect(text).toContain('changement automatique');
      expect(text).not.toContain('information obligatoire a été retirée');
    });

    it('explique un retour à une étape précédente', () => {
      const text = render([statusChange('besoin_valide', 'complet')]);

      expect(text).toContain('une information obligatoire a été retirée');
    });

    it("n'affiche rien pour un changement fait par le courtier", () => {
      const text = render([statusChange('complet', 'besoin_valide', false)]);

      expect(text).not.toContain('changement automatique');
    });
  });
});
