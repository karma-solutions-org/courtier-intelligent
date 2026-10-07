import type { Mocked } from 'vitest';

/**
 * @description A mock of `T` holding a `vi.fn()` for each of the methods named,
 * the shape `jasmine.createSpyObj` gave: name the methods, get a mock of the
 * contract back. The methods left unnamed are absent, so a call to one fails.
 */
export function createMockObject<T>(methods: readonly (keyof T)[]): Mocked<T> {
  return Object.fromEntries(methods.map((method) => [method, vi.fn()])) as unknown as Mocked<T>;
}
