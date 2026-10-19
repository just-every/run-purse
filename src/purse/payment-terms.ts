import { date, requireThat } from './types';
export const paymentTerms = ['Net 15', 'Net 30', 'Net 60', '2/10 Net 30', 'Due on receipt'];
export function addDays(day: string, days: number) {
    return new Date(Date.parse(day + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}
export function termDates(invoiceDate: unknown, term: unknown) {
    const day = date(invoiceDate, 'Invoice date');
    requireThat(typeof term === 'string' && paymentTerms.includes(term), 'Choose a supported payment term');
    const days = term === 'Due on receipt' ? 0 : term === 'Net 15' ? 15 : term === 'Net 60' ? 60 : 30;
    return { invoiceDate: day, term, dueDate: addDays(day, days), discountDate: term === '2/10 Net 30' ? addDays(day, 10) : null, discountPercent: term === '2/10 Net 30' ? 2 : 0 };
}
export function weekOf(day: string) {
    const weekday = new Date(day + 'T12:00:00Z').getUTCDay();
    return addDays(day, -(weekday + 6) % 7);
}
