import type { D } from './shared';
export function ImportHistory({ report }: { report?: D }) {
    if (!report?.reconciliation?.length) return null;
    const fields = (values: D[]) => values.length ? values.map(field => `${field.name} [${field.sourceId}]: ${JSON.stringify(field.value)}`).join(' · ') : 'No custom values';
    return <section aria-label="Historical import reconciliation" style={{ overflowWrap: 'anywhere' }}>
        <h4>Historical reconciliation</h4><p>Counts are distinct headers and lines per supplier, source period and currency. Request and PO periods use need dates; invoice periods use invoice dates. Amounts are integer minor units. Each record kind reconciles separately.</p>
        <ul className="ruled-list">{report.reconciliation.map((row: D, index: number) => <li key={index}>{row.kind} · {row.supplier} · {row.period} · {row.currency} · {row.records} records · {row.lines} lines · {row.totalMinor} minor units</li>)}</ul>
        <details><summary>Historical source identities and fields</summary><p>Source definitions, field values and approvals are inert history. They do not configure native fields or grant purchasing or member authority.</p>
            {report.historicalRecords.map((record: D) => <details key={record.id}><summary>{record.sourceId}</summary><p>Header: {fields(record.headerFields)}</p><ul>{record.lines.map((line: D, index: number) => <li key={index}>Exact line: <code style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(line.sourceLineId)}</code>{line.orderLine && <> · PO line {line.orderLine}</>} · {fields(line.fields)}</li>)}</ul><p>Original logical CSV rows: {record.sourceRows.map((row: D) => row.row).join(', ')}</p></details>)}
        </details>
    </section>;
}
