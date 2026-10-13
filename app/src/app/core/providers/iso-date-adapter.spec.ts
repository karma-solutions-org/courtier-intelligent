import { TestBed } from '@angular/core/testing';
import { DateAdapter } from '@angular/material/core';
import { IsoDateAdapter, provideIsoDates } from './iso-date-adapter';

describe('IsoDateAdapter', () => {
  let adapter: IsoDateAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideIsoDates() });
    adapter = TestBed.inject(DateAdapter) as IsoDateAdapter;
  });

  it('affiche jj/mm/aaaa et lit la saisie française', () => {
    expect(adapter.format('1990-03-12', 'input')).toBe('12/03/1990');
    expect(adapter.parse('12/03/1990')).toBe('1990-03-12');
    expect(adapter.parse('5/3/1990')).toBe('1990-03-05');
  });

  it('refuse les dates inexistantes et accepte le vide', () => {
    expect(adapter.isValid(adapter.parse('31/02/2020')!)).toBe(false);
    expect(adapter.parse('')).toBeNull();
    expect(adapter.deserialize('')).toBeNull();
  });

  it('calcule dans le calendrier sans décalage de fuseau', () => {
    expect(adapter.addCalendarMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(adapter.addCalendarDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(adapter.getFirstDayOfWeek()).toBe(1);
  });
});
