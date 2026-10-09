import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { ExtensionPing } from '../../../../../core/providers/extension.provider';
import { ExtensionIndicatorComponent } from './extension-indicator.component';

describe('ExtensionIndicatorComponent', () => {
  const render = (ping: ExtensionPing | null) => {
    const fixture = TestBed.createComponent(ExtensionIndicatorComponent);
    fixture.componentRef.setInput('ping', ping);
    return page.elementLocator(fixture.nativeElement);
  };

  it('affiche « Extension installée » avec sa version', async () => {
    const root = render({ status: 'installed', version: '0.1.0' });

    await expect.element(root.getByText('Extension installée')).toBeVisible();
    await expect.element(root.getByRole('status')).toHaveAttribute('title', 'Version 0.1.0');
  });

  it('signale une extension non installée', async () => {
    const root = render({ status: 'absent' });

    await expect.element(root.getByText('Extension non installée')).toBeVisible();
    await expect.element(root.getByText('Extension installée')).not.toBeInTheDocument();
  });

  it.each([null, { status: 'unsupported' }, { status: 'unconfigured' }] as (ExtensionPing | null)[])(
    "n'affiche rien quand la détection est impossible ou pas encore faite (%j)",
    async ping => {
      const root = render(ping);

      await expect.element(root.getByRole('status')).not.toBeInTheDocument();
    },
  );
});
