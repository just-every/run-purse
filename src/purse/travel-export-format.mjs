const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const value = (input, label, max = 2000) => { ensure(typeof input === 'string' && input.trim() && input.length <= max, `${label} required`); return input.trim(); };
const email = input => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
const validDate = input => /^\d{4}-\d{2}-\d{2}$/.test(input) && Number.isFinite(Date.parse(input)) && new Date(input).toISOString().slice(0, 10) === input;
const amount = input => {
    ensure(typeof input === 'string' && /^(0|[1-9]\d{0,10})(\.\d{1,2})?$/.test(input), 'Use unsigned decimal amounts with at most two fractional digits');
    const [whole, fraction = ''] = input.split('.'), result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    ensure(Number.isSafeInteger(result) && result <= 1e12, 'Expense amount too large'); return result;
};

/** Provider exports have configurable columns. These are starting selections;
 * the reviewed mapping always names the exact original header. */
export const travelExportColumns = {
    expensify: { id: 'Expense ID', date: 'Date', amount: 'Amount', currency: 'Currency', traveler: 'Submitter Email', reference: 'Purse Reference', description: 'Description' },
    navan: { id: 'Transaction ID', date: 'Transaction Date', amount: 'Amount', currency: 'Currency', traveler: 'Employee Email', reference: 'Purse Reference', description: 'Description' },
    ramp: { id: 'External ID', date: 'Transaction Date', amount: 'Original Currency Amount', currency: 'Original Currency Code', traveler: 'User Email', reference: 'Accounting Purse Reference', description: 'Merchant Name' },
    brex: { id: 'Expense ID', date: 'Date', amount: 'Amount', currency: 'Currency', traveler: 'Employee Email', reference: 'Purse Reference', description: 'Memo' },
};

/** Strict quoted CSV, including embedded commas, doubled quotes and newlines. */
function csv(original) {
    const rows = []; let row = [], cell = '', quoted = false, closed = false;
    const input = original.replace(/^\uFEFF/, '');
    for (let i = 0; i < input.length; i++) {
        const character = input[i];
        if (quoted) {
            if (character === '"' && input[i + 1] === '"') { cell += '"'; i++; }
            else if (character === '"') { quoted = false; closed = true; }
            else cell += character;
        } else if (character === ',' || character === '\n' || character === '\r') {
            row.push(cell); cell = ''; closed = false;
            if (character !== ',') { if (character === '\r' && input[i + 1] === '\n') i++; rows.push(row); row = []; }
        } else if (character === '"') {
            ensure(cell === '' && !closed, 'Malformed CSV quotation'); quoted = true;
        } else { ensure(!closed, 'Unexpected text after a quoted CSV field'); cell += character; }
    }
    ensure(!quoted, 'Unclosed CSV quotation');
    if (cell !== '' || row.length || closed) rows.push([...row, cell]);
    ensure(rows.length >= 2 && rows.length <= 501, 'Upload a header and 1–500 expense rows');
    const headers = rows.shift();
    ensure(headers.every(header => header && header === header.trim()) && new Set(headers).size === headers.length, 'CSV headers must be unique and nonempty');
    ensure(rows.every(record => record.length === headers.length), 'CSV row width differs from its header');
    return { headers, rows };
}

export function parseTravelCsv(original, provider, rawReview, rawColumns, approvalReference, travelerEmail) {
    ensure(Object.hasOwn(travelExportColumns, provider), 'Select Expensify, Navan, Ramp or Brex');
    const review = rawReview ?? {}, supplied = rawColumns ?? travelExportColumns[provider];
    const sourceAccount = value(review.sourceAccount, 'Source workspace or account', 200);
    const id = value(review.reportId, 'Source report ID', 200), title = value(review.title, 'Source report title');
    const approvedBy = value(review.approvedBy, 'Independent final approver email', 254);
    ensure(email(approvedBy) && approvedBy.toLowerCase() !== travelerEmail.toLowerCase(), 'Final source approval must be by someone other than the traveler');
    const approvedAt = value(review.approvedAt, 'Final source approval date', 40);
    ensure(validDate(approvedAt), 'Use a valid YYYY-MM-DD source approval date');
    const status = value(review.status, 'Source report status', 40).toLowerCase();
    ensure(['approved', 'reimbursed', 'paid'].includes(status), 'An independently approved final expense report is required');
    ensure(review.final === true && review.approvalReviewed === true, 'Review the independent final approval and completeness of this report');
    const totalMinor = amount(value(review.totalAmount, 'Reviewed report total', 30));
    ensure(totalMinor > 0, 'Report total must be positive');
    const { headers, rows } = csv(original), columns = {};
    for (const key of Object.keys(travelExportColumns[provider])) {
        columns[key] = value(supplied[key], `CSV ${key} column`, 200);
        ensure(headers.includes(columns[key]), `CSV column missing: ${columns[key]}`);
    }
    ensure(new Set(Object.values(columns)).size === Object.keys(columns).length, 'Each expense field needs its own CSV column');
    let currency;
    const items = rows.map(row => {
        const read = key => row[headers.indexOf(columns[key])];
        ensure(read('traveler') === travelerEmail, 'CSV traveler differs from the approved trip');
        ensure(read('reference') === approvalReference, 'Every CSV expense must carry this exact travel approval reference');
        const currentCurrency = read('currency');
        ensure(/^[A-Z]{3}$/.test(currentCurrency) && (!currency || currentCurrency === currency), 'CSV expenses must use one exact currency'); currency = currentCurrency;
        const spentOn = read('date'); ensure(validDate(spentOn), 'Use YYYY-MM-DD expense dates');
        ensure(spentOn <= approvedAt, 'An expense is dated after the reviewed final approval');
        return { id: value(read('id'), 'CSV expense ID', 200), date: spentOn, amountMinor: amount(read('amount')), description: value(read('description'), 'CSV expense description'), merchant: '' };
    });
    ensure(new Set(items.map(item => item.id)).size === items.length, 'CSV expenses must have distinct IDs');
    ensure(items.reduce((sum, item) => sum + item.amountMinor, 0) === totalMinor, 'CSV expenses do not add to the reviewed final report total');
    return { id, title, revision: 1, number: id, employeeEmail: travelerEmail, status, currency, totalMinor, items, approvedAt,
        sourceReview: { sourceAccount, reportId: id, title, approvedBy, approvedAt, status, totalAmount: (totalMinor / 100).toFixed(2), final: true, approvalReviewed: true }, columns };
}
