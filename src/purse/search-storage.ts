import { purchasingSearchText } from './search-text';
/** FTS is excluded from archives. Rebuild it before the first domain mutation,
 * whose delete/update triggers require the restored projection to be indexed. */
export async function ensureSearchStorage(db: D1Database) {
    // Derived comment text is rebuilt from current history after restore too.
    // The parent index keeps a purchasing search from scanning every comment
    // for every result. No comment source bytes or authority are changed.
    const missing = await db.prepare(`SELECT p.business,p.id,p.revision,p.value FROM p_records p
        LEFT JOIN p_comment_search c ON c.business=p.business AND c.comment=p.id
        WHERE p.kind='comment' AND c.comment IS NULL`).all<{ business: string; id: string; revision: string; value: string }>();
    for (let offset = 0; offset < missing.results.length; offset += 50) {
        await db.batch(missing.results.slice(offset, offset + 50).map(row => {
            const comment = JSON.parse(row.value), body = comment.status === 'active' ? comment.versions.at(-1).body : '';
            return db.prepare(`INSERT OR IGNORE INTO p_comment_search(business,comment,parent_kind,parent_record,body)
                SELECT business,id,?,?,? FROM p_records WHERE business=? AND kind='comment' AND id=? AND revision=?`)
                .bind(comment.kind, comment.record, purchasingSearchText(body.split('\n').map((text: string) => ({ text }))), row.business, row.id, row.revision);
        }));
    }
    await db.prepare("INSERT INTO p_search_fts(p_search_fts) SELECT 'rebuild' WHERE (SELECT count(*) FROM p_search_fts_docsize)!=(SELECT count(*) FROM p_search)").run();
}
