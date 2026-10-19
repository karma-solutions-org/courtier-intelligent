import { inject, Injectable, Provider } from '@angular/core';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MatDateFormats,
  NativeDateAdapter,
} from '@angular/material/core';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const FR = /^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{4})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Dates manipulées sous forme de chaînes « aaaa-mm-jj » (le format stocké dans Firestore) et affichées « jj/mm/aaaa ».
 * Les champs natifs `type="date"` suivent la langue du navigateur (mm/dd/yyyy en anglais) : on passe par le datepicker.
 */
@Injectable()
export class IsoDateAdapter extends DateAdapter<string> {
  private readonly _native = new NativeDateAdapter();

  constructor() {
    super();
    this.setLocale(inject(MAT_DATE_LOCALE));
  }

  private toDate(date: string): Date {
    const [, y, m, d] = ISO.exec(date) ?? [];
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  private fromDate(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  /** Construit une date en vérifiant qu'elle existe (pas de 31/02). */
  private build(year: number, month: number, day: number): string | null {
    const date = new Date(year, month, day);
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
      ? this.fromDate(date)
      : null;
  }

  getYear = (date: string) => this.toDate(date).getFullYear();
  getMonth = (date: string) => this.toDate(date).getMonth();
  getDate = (date: string) => this.toDate(date).getDate();
  getDayOfWeek = (date: string) => this.toDate(date).getDay();
  getMonthNames = (style: 'long' | 'short' | 'narrow') => this._native.getMonthNames(style);
  getDateNames = () => this._native.getDateNames();
  getDayOfWeekNames = (style: 'long' | 'short' | 'narrow') => this._native.getDayOfWeekNames(style);
  getYearName = (date: string) => String(this.getYear(date));
  getFirstDayOfWeek = () => 1;
  getNumDaysInMonth = (date: string) => this._native.getNumDaysInMonth(this.toDate(date));
  clone = (date: string) => date;
  createDate = (year: number, month: number, day: number) =>
    this.build(year, month, day) ?? this.invalid();
  today = () => this.fromDate(new Date());

  parse(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }
    const text = value.trim();
    const iso = ISO.exec(text);
    if (iso) {
      return this.build(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) ?? this.invalid();
    }
    const fr = FR.exec(text);
    if (fr) {
      return this.build(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1])) ?? this.invalid();
    }
    return this.invalid();
  }

  format(date: string, displayFormat: string): string {
    if (!this.isValid(date)) {
      return '';
    }
    const value = this.toDate(date);
    if (displayFormat === 'input') {
      return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`;
    }
    return this._native.format(
      value,
      displayFormat === 'monthYear' ? { year: 'numeric', month: 'long' } : { dateStyle: 'long' },
    );
  }

  addCalendarYears = (date: string, years: number) => this.addCalendarMonths(date, years * 12);
  addCalendarMonths = (date: string, months: number) =>
    this.fromDate(this._native.addCalendarMonths(this.toDate(date), months));
  addCalendarDays = (date: string, days: number) =>
    this.fromDate(this._native.addCalendarDays(this.toDate(date), days));
  toIso8601 = (date: string) => date;
  isDateInstance = (obj: unknown) => typeof obj === 'string';
  isValid = (date: string) =>
    ISO.test(date) &&
    this.build(this.getYear(date), this.getMonth(date), this.getDate(date)) !== null;
  invalid = () => 'invalid';

  override deserialize(value: unknown): string | null {
    return value === '' || value == null
      ? null
      : typeof value === 'string' && ISO.test(value)
        ? value
        : this.invalid();
  }
}

const FORMATS: MatDateFormats = {
  parse: { dateInput: 'input' },
  display: {
    dateInput: 'input',
    monthYearLabel: 'monthYear',
    dateA11yLabel: 'long',
    monthYearA11yLabel: 'monthYear',
  },
};

/** Datepickers en français, valeurs « aaaa-mm-jj ». */
export const provideIsoDates = (): Provider[] => [
  { provide: MAT_DATE_LOCALE, useValue: 'fr-FR' },
  { provide: DateAdapter, useClass: IsoDateAdapter },
  { provide: MAT_DATE_FORMATS, useValue: FORMATS },
];
