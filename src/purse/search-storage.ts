/** FTS is excluded from archives. Rebuild it before the first domain mutation,
 * whose delete/update triggers require the restored projection to be indexed. */
export async function ensureSearchStorage(db: D1Database) {
    await db.prepare("INSERT INTO p_search_fts(p_search_fts) SELECT 'rebuild' WHERE (SELECT count(*) FROM p_search_fts_docsize)!=(SELECT count(*) FROM p_search)").run();
}
