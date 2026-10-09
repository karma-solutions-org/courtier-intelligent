import { Assure } from '@shared';

/** Saisie du formulaire assuré (champs vides = chaîne vide). */
export interface AssureFormModel {
  type: Assure['type'];
  civilite: 'M.' | 'Mme' | '';
  firstName: string;
  lastName: string;
  companyName: string;
  siret: string;
  birthDate: string;
  email: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
}

/** Champs de l'assuré écrits en base (sans createdBy / createdAt / updatedAt, ajoutés par le service). */
export type AssureData = Omit<Assure, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>;

const orNull = (text: string): string | null => text.trim() || null;

export function toAssureData(form: AssureFormModel): AssureData {
  const isPro = form.type === 'pro';
  return {
    type: form.type,
    civilite: isPro ? null : form.civilite || null,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    companyName: isPro ? orNull(form.companyName) : null,
    siret: isPro ? orNull(form.siret.replace(/\s/g, '')) : null,
    birthDate: isPro ? null : orNull(form.birthDate),
    email: orNull(form.email.toLowerCase()),
    phone: orNull(form.phone),
    address: {
      street: orNull(form.street),
      postalCode: orNull(form.postalCode),
      city: orNull(form.city),
      country: 'FR',
    },
  };
}
