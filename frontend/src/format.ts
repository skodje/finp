import type { Account } from './types';

export function money(value: string | number) {
  return `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Number(value))} kr`;
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function monthLabel(month: string) {
  return new Intl.DateTimeFormat('nb-NO', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T12:00:00`));
}

export function accountTypeLabel(type: Account['type']) {
  return type === 'credit_card' ? 'Kredittkort' : 'Bankkonto';
}

export function needsReview(confidence: string | null) {
  return Number(confidence ?? 1) < 0.8;
}
