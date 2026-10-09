import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { faker } from '@faker-js/faker';
import { Invitation, Member, MemberStatus, CabinetRole } from '@shared';
import { page } from 'vitest/browser';
import { mockInvitation, mockMember, mockTimestamp } from '../../../../../core/utils/unit-test-utils/mocks/cabinet.mock';
import { MembersPanelComponent } from './members-panel.component';

/** L'onglet « Membres » des paramètres, tel que l'admin du cabinet le manipule. */
class MembersPanelTester {
  readonly fixture = TestBed.createComponent(MembersPanelComponent);
  readonly root = page.elementLocator(this.fixture.nativeElement);

  readonly inviteEmail = this.root.getByRole('textbox', { name: 'Email' });
  readonly inviteButton = this.root.getByRole('button', { name: 'Inviter' });

  readonly invited: { email: string; role: CabinetRole }[] = [];
  readonly roleChanges: { uid: string; role: CabinetRole }[] = [];
  readonly statusChanges: { uid: string; status: MemberStatus }[] = [];
  readonly cancelledInvitations: string[] = [];
  readonly deviceResets: string[] = [];

  constructor() {
    const component = this.fixture.componentInstance;
    component.invited.subscribe(event => this.invited.push(event));
    component.roleChanged.subscribe(event => this.roleChanges.push(event));
    component.statusChanged.subscribe(event => this.statusChanges.push(event));
    component.invitationCancelled.subscribe(id => this.cancelledInvitations.push(id));
    component.deviceReset.subscribe(uid => this.deviceResets.push(uid));
  }

  setInputs(inputs: {
    members?: Member[];
    invitations?: Invitation[];
    currentUid?: string | null;
    maxUtilisateurs?: number;
    deviceResetsUsed?: number;
    deviceResetsQuota?: number;
  }): void {
    for (const [name, value] of Object.entries(inputs)) {
      this.fixture.componentRef.setInput(name, value);
    }
  }

  /** La ligne du tableau d'un membre. */
  row(member: Member) {
    return this.root.getByRole('row').filter({ hasText: member.email! });
  }
}

describe('MembersPanelComponent', () => {
  let tester: MembersPanelTester;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    tester = new MembersPanelTester();
  });

  it("invite un collaborateur en courtier par défaut, avec l'email en minuscules", async () => {
    const email = faker.internet.email();

    await tester.inviteEmail.fill(`  ${email.toUpperCase()}  `);
    await tester.inviteButton.click();

    expect(tester.invited).toEqual([{ email: email.toLowerCase(), role: 'courtier' }]);
  });

  it("n'envoie pas d'invitation sans email valide", async () => {
    await tester.inviteEmail.fill('pas-un-email');
    await tester.inviteButton.click();

    await expect.element(tester.root.getByText("L'email n'est pas valide")).toBeVisible();
    expect(tester.invited).toEqual([]);
  });

  it('liste les membres avec leur statut', async () => {
    const active = mockMember({ status: 'active' });
    const disabled = mockMember({ status: 'disabled' });
    tester.setInputs({ members: [active, disabled] });

    await expect.element(tester.row(active).getByText('Actif', { exact: true })).toBeVisible();
    await expect.element(tester.row(disabled).getByText('Désactivé', { exact: true })).toBeVisible();
  });

  it("désactive un collègue, et le réactive", async () => {
    const colleague = mockMember({ status: 'active' });
    const former = mockMember({ status: 'disabled' });
    tester.setInputs({ members: [colleague, former] });

    await tester.row(colleague).getByRole('button', { name: 'Désactiver' }).click();
    await tester.row(former).getByRole('button', { name: 'Réactiver' }).click();

    expect(tester.statusChanges).toEqual([
      { uid: colleague.id, status: 'disabled' },
      { uid: former.id, status: 'active' },
    ]);
  });

  it("ne permet pas à l'admin de modifier son propre rôle ni de se désactiver", async () => {
    const me = mockMember({ role: 'admin' });
    tester.setInputs({ members: [me], currentUid: me.id });

    await expect.element(tester.row(me).getByText('(vous)')).toBeVisible();
    // mat-select signale son état par aria-disabled, pas par l'attribut disabled.
    await expect.element(tester.row(me).getByRole('combobox')).toHaveAttribute('aria-disabled', 'true');
    await expect.element(tester.row(me).getByRole('button', { name: 'Désactiver' })).not.toBeInTheDocument();
  });

  it("change le rôle d'un collègue", async () => {
    const colleague = mockMember({ role: 'courtier' });
    tester.setInputs({ members: [colleague] });

    await tester.row(colleague).getByRole('combobox').click();
    await page.getByRole('option', { name: 'Administrateur' }).click();

    expect(tester.roleChanges).toEqual([{ uid: colleague.id, role: 'admin' }]);
  });

  it('montre les invitations en attente', async () => {
    const invitation = mockInvitation({ role: 'admin' });
    tester.setInputs({ invitations: [invitation] });

    await expect.element(tester.root.getByText('Invitations en attente')).toBeVisible();
    await expect.element(tester.root.getByText(invitation.email)).toBeVisible();
  });

  describe("Limite d'utilisateurs de l'offre", () => {
    it('compte les membres actifs et les invitations en attente', async () => {
      tester.setInputs({
        members: [mockMember({ status: 'active' }), mockMember({ status: 'disabled' })],
        invitations: [mockInvitation()],
        maxUtilisateurs: 3,
      });

      await expect.element(tester.root.getByText('2 / 3')).toBeVisible();
      await expect.element(tester.inviteButton).toBeEnabled();
    });

    it('bloque les invitations quand la limite est atteinte', async () => {
      tester.setInputs({
        members: [mockMember({ status: 'active' }), mockMember({ status: 'active' })],
        invitations: [mockInvitation()],
        maxUtilisateurs: 3,
      });

      await expect.element(tester.root.getByText('3 / 3')).toBeVisible();
      await expect.element(tester.root.getByText(/a atteint sa limite/)).toBeVisible();
      await expect.element(tester.inviteButton).toBeDisabled();
    });

    it('annule une invitation pour libérer une place', async () => {
      const invitation = mockInvitation();
      tester.setInputs({ invitations: [invitation] });

      await tester.root.getByRole('button', { name: 'Annuler' }).click();

      expect(tester.cancelledInvitations).toEqual([invitation.id]);
    });
  });

  describe('Appareil lié', () => {
    const withDevice = () => mockMember({ device: { id: 'appareil-1', label: 'Chrome · Windows', boundAt: mockTimestamp() } });

    it("montre l'appareil lié de chaque membre", async () => {
      const member = withDevice();
      const noDevice = mockMember({ device: null });
      tester.setInputs({ members: [member, noDevice] });

      await expect.element(tester.row(member).getByText('Chrome · Windows')).toBeVisible();
      await expect.element(tester.row(noDevice).getByText('Aucun appareil lié')).toBeVisible();
    });

    it("réinitialise l'appareil après confirmation seulement", async () => {
      const member = withDevice();
      tester.setInputs({ members: [member] });

      await tester.row(member).getByRole('button', { name: "Réinitialiser l'appareil" }).click();
      expect(tester.deviceResets).toEqual([]);

      await tester.row(member).getByRole('button', { name: 'Confirmer' }).click();
      expect(tester.deviceResets).toEqual([member.id]);
    });

    it('bloque la réinitialisation quand le quota du mois est atteint', async () => {
      const member = withDevice();
      tester.setInputs({ members: [member], deviceResetsUsed: 2, deviceResetsQuota: 2 });

      await expect.element(tester.root.getByText('2 / 2')).toBeVisible();
      await expect.element(tester.root.getByText(/Quota de réinitialisations atteint/)).toBeVisible();
      await expect.element(tester.row(member).getByRole('button', { name: "Réinitialiser l'appareil" })).toBeDisabled();
    });
  });
});
