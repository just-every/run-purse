import { separated } from './separated';
import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react';
export type D = Record<string, any>;
export async function call(path: string, input?: D) { const response = await fetch('/api/purse/' + path, input ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) } : undefined); const body: any = await response.json(); if (!response.ok)
    throw new Error(body.error || 'Request failed'); return body; }
export function Field({ label, name = label, defaultValue = '', type = 'text', required = true, options }: {
    label: string;
    name?: string;
    defaultValue?: any;
    type?: string;
    required?: boolean;
    options?: {
        value: string;
        label: string;
    }[];
}) { return <label className={type === 'textarea' ? 'field field-wide' : 'field'}>{label}{options ? <select aria-label={label} name={name} defaultValue={defaultValue} required={required}><option value="">Choose…</option>{options.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}</select> : type === 'textarea' ? <textarea aria-label={label} name={name} defaultValue={defaultValue} required={required}/> : <input aria-label={label} name={name} type={type} defaultValue={defaultValue} required={required} step={type === 'number' ? '1' : undefined}/>}</label>; }
/** A record form: quiet labels over thin fields, the blue primary action at its end, and its error beside the action. */
export function Form({ children, onSubmit, label = 'Save', initial = {}, className = '' }: {
    children: ReactNode;
    onSubmit: (b: D) => Promise<any>;
    label?: string;
    initial?: D;
    className?: string;
}) { const [busy, setBusy] = useState(false), [error, setError] = useState(''); return <form className={`record-form ${className}`.trim()} onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; setBusy(true); setError(''); try {
    await onSubmit({ ...initial, ...Object.fromEntries(new FormData(form)) });
}
catch (error) {
    setError((error as Error).message);
}
finally {
    setBusy(false);
} }}>{children}<div className="form-end"><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : label}</button>{error && <p role="alert">{error}</p>}</div></form>; }
export const options = (rows: D[], label = 'name') => rows.map(r => ({ value: r.id, label: r[label] || r.id }));
const grouped = (whole: string) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** Exact minor units: "$5,148.00" in US dollars, "AUD 5,148.00" in any other currency; unlike currencies are never added together. */
export const money = (minor: number, currency: string) => { const [whole, fraction] = (minor / 100).toFixed(2).split('.'); return currency === 'USD' ? `${whole.startsWith('-') ? '−$' + grouped(whole.slice(1)) : '$' + grouped(whole)}.${fraction}` : `${currency} ${grouped(whole)}.${fraction}`; };
/** Form defaults are currency text; parsing and validation belong to the server. */
export const amountText = (minor?: number | null) => minor == null ? '' : (minor / 100).toFixed(2);
/** Human timestamps use one US, minute-resolution format throughout the workspace: "Tue Oct 20, 2026, 9:48 am". */
export function when(iso?: string | null, timeZone?: string) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return '—';
    return <time dateTime={iso} className="record-time">{`${usDay(date, timeZone)}, ${clock(date, timeZone)}`}</time>;
}
const parts = (date: Date, timeZone: string | undefined, options: Intl.DateTimeFormatOptions) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, ...options }).formatToParts(date).map(p => [p.type, p.value]));
/** "9:48 am" on the business clock. */
export function clock(date: Date, timeZone?: string) { const p = parts(date, timeZone, { hour: 'numeric', minute: '2-digit', hour12: true }); return `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`; }
/** "Tue Oct 20, 2026" on the business calendar. */
export function usDay(date: Date, timeZone?: string) { const p = parts(date, timeZone, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); return `${p.weekday} ${p.month} ${p.day}, ${p.year}`; }
/** A calendar date ("2026-11-03") as "Tue Nov 3, 2026"; anything else is shown as written. */
export function calendarDay(value?: string | null) { if (!value) return '—'; return /^\d{4}-\d{2}-\d{2}$/.test(value) ? usDay(new Date(value + 'T12:00:00Z'), 'UTC') : value; }
/** Each cell carries its column head, so a wide table can stack into label/value blocks on a phone. */
function labelled(row: ReactNode, heads: string[]): ReactNode {
    if (!isValidElement(row)) return row;
    const element = row as ReactElement<{ children?: ReactNode }>;
    return cloneElement(element, {}, Children.toArray(element.props.children).map((cell, i) => isValidElement(cell) ? cloneElement(cell as ReactElement<D>, { 'data-label': heads[i] || undefined }, <div className="cell-value">{(cell as ReactElement<D>).props.children}</div>) : cell));
}
/** The record table: a white card with hairline rows and quiet heads, figures right-aligned. More than two columns stack at phone width. */
export function Table({ heads, children, figures = [], stack = heads.filter(Boolean).length > 2 }: {
    heads: string[];
    children: ReactNode;
    figures?: string[];
    stack?: boolean;
}) { return <div className={stack ? 'record-table record-table-stack' : 'record-table'}><table><thead><tr>{heads.map((h, i) => <th key={h || i} className={figures.includes(h) ? 'figure' : undefined}>{h}</th>)}</tr></thead><tbody>{separated(Children.map(children, row => labelled(row, heads)))}</tbody></table></div>; }
/** Plain words from the record ("approved · v2", "issued") on a quiet grey chip; never a traffic-light colour. */
export function Chip({ children }: { children: ReactNode }) { return <span className="chip">{children}</span>; }
export function Attachments({ data, kind, record, mutate, invoice = false }: {
    data: D;
    kind: string;
    record: string;
    invoice?: boolean;
    mutate: (op: string, b: D) => Promise<any>;
}) { const files = data.attachment.filter((x: D) => x.kind === kind && x.record === record); return <section className="attachments">{invoice ? <h5>Invoice evidence</h5> : <h3>Evidence files</h3>}{files.length > 0 && <ul className="ruled-list">{files.map((f: D) => <li key={f.id}><a href={`/api/purse/download/attachment/${f.id}`}>{f.name}</a> · {f.size} bytes</li>)}</ul>}<Form className="record-form-inline" label="Upload evidence" onSubmit={async (b) => { const f = b.file as File; const bytes = new Uint8Array(await f.arrayBuffer()); let raw = ''; for (const x of bytes)
    raw += String.fromCharCode(x); return mutate('attachment', { kind, record, name: f.name, mediaType: f.type || 'application/octet-stream', base64: btoa(raw) }); }}><label className="field">Evidence file<input type="file" name="file" required/></label></Form></section>; }
export function Details({ label, children }: {
    label: string;
    children: ReactNode;
}) { return <details className="disclosure"><summary>{separated(label)}</summary><div className="disclosure-body">{children}</div></details>; }
