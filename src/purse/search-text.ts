/** Search only readable document text; payment identifiers remain in the private original. */
export function purchasingSearchText(rows: {text:string}[]) {
    return rows.map(row => row.text)
        .filter(line => !/\b(?:bank|routing|account|IBAN|SWIFT|TIN|SSN|EIN|tax\s*(?:id|number))\b/i.test(line))
        .map(line => line.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, ' ').replace(/\b\d{3}-\d{2}-\d{4}\b/g, ' ').replace(/\b\d{2}-\d{7}\b/g, ' ').replace(/\b\d{8,}\b/g, ' '))
        .join('\n');
}
