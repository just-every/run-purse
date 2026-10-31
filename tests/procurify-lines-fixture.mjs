import { readFile } from 'node:fs/promises';
export const mapping = { columns: {}, decimal: '.', date: 'YYYY-MM-DD', statuses: { active: 'active', approved: 'historical-approved' } };
export const input = async () => ({ filename: 'procurify-multiline.csv', csv: await readFile('public/fixtures/procurify-multiline.csv', 'utf8'), mapping });
export const email = n => ['synthetic-purse-' + n, 'example.test'].join('@');
export const ids = { request:'procurify:request: synthetic-purse-request ', order:'procurify:order: synthetic-purse-order ', invoice:'procurify:invoice: synthetic-purse-invoice ' };
export async function configure(h) {
    await h.command('business', { name:'Synthetic import workspace', currencies:['USD','EUR'], locations:['Denver'], costCentres:['Operations'], projects:['Fitout'] });
}
export async function importCall(h, op, body, expected = 200, cookie = h.owner) {
    const response = await h.send('/api/purse/import/' + op, body, cookie);
    if (response.status !== expected) throw Error(op + ': ' + response.status + ' ' + JSON.stringify(response.value));
    return response.value;
}
