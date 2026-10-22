import { Table, when, type D } from './shared';

export function ApprovalEditNotices({ data }: { data: D }) {
    const notices = data.approvalEditNotice ?? [];
    if (!notices.length) return null;
    return <section aria-label="Changes to requests you approved"><h2>Request corrections</h2>
        {notices.map((notice: D) => <details key={notice.request + ':' + notice.revision}>
            <summary>Request {notice.request} · revision {notice.fromRevision} → {notice.revision}</summary>
            <p>{when(notice.at)} · {notice.basis}</p>
            <Table heads={['Edited field', 'Before', 'After']}>{notice.differences.map((difference: D) =>
                <tr key={difference.field}><td>{difference.field}</td><td>{difference.before ?? 'Not set'}</td><td>{difference.after ?? 'Not set'}</td></tr>)}</Table>
        </details>)}
    </section>;
}
