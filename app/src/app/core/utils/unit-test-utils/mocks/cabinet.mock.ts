import { faker } from '@faker-js/faker';
import { Invitation, Member, CabinetRole, TimestampLike } from '@shared';
import { AuthUser } from '../../../providers/authentication.provider';

/** Un horodatage Firestore pour [date]. */
export function mockTimestamp(date: Date = faker.date.recent()): TimestampLike {
  return { toMillis: () => date.getTime() };
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
    authTime: 1_790_000_000,
    emailVerified: true,
    ...overrides,
  };
}
