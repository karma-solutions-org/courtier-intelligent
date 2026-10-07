import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { faker } from '@faker-js/faker';
import { Invitation, Member, MemberStatus, CabinetRole } from '@shared';
import { page } from 'vitest/browser';
import { mockInvitation, mockMember } from '../../../../../core/utils/unit-test-utils/mocks/cabinet.mock';
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

  constructor() {
    const component = this.fixture.componentInstance;
    component.invited.subscribe(event => this.invited.push(event));
    component.roleChanged.subscribe(event => this.roleChanges.push(event));
    component.statusChanged.subscribe(event => this.statusChanges.push(event));
  }

  setInputs(inputs: { members?: Member[]; invitations?: Invitation[]; currentUid?: string | null }): void {
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
});
