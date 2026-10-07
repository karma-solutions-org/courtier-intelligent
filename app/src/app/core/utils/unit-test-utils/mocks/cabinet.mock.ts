import { faker } from '@faker-js/faker';
import { Invitation, Member, Cabinet, CabinetRole, TimestampLike } from '@shared';
import { AuthUser } from '../../../providers/authentication.provider';

/** Un horodatage Firestore pour [date]. */
export function mockTimestamp(date: Date = faker.date.recent()): TimestampLike {
  return { toMillis: () => date.getTime() };
}

export function mockCabinet(overrides: Partial<Cabinet> = {}): Cabinet {
  return {
    id: faker.string.alphanumeric(20),
    name: `Cabinet ${faker.person.lastName()}`,
    orias: faker.string.numeric(8),
    address: faker.location.streetAddress(),
    phone: `0${faker.string.numeric(9)}`,
    email: faker.internet.email().toLowerCase(),
    logoPath: null,
    active: true,
    ownerUid: faker.string.alphanumeric(28),
    enabledInsurers: [],
    enabledProducts: [],
    createdAt: mockTimestamp(),
    ...overrides,
  };
}

export function mockMember(overrides: Partial<Member> = {}): Member {
  return {
    id: faker.string.alphanumeric(28),
    email: faker.internet.email().toLowerCase(),
    displayName: faker.person.fullName(),
    role: faker.helpers.arrayElement<CabinetRole>(['admin', 'courtier']),
    status: 'active',
    createdAt: mockTimestamp(),
    ...overrides,
  };
}

export function mockInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: faker.string.alphanumeric(20),
    email: faker.internet.email().toLowerCase(),
    role: 'courtier',
    status: 'pending',
    invitedBy: faker.string.alphanumeric(28),
    expiresAt: mockTimestamp(faker.date.soon({ days: 7 })),
    ...overrides,
  };
}

export function mockAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    uid: faker.string.alphanumeric(28),
    email: faker.internet.email().toLowerCase(),
    displayName: faker.person.fullName(),
    cabinetId: faker.string.alphanumeric(20),
    role: 'courtier',
    ...overrides,
  };
}
