import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { actor, load, readFence, save } from './store';
import { matchingInputs } from './supplier-identity';
import { audit, Fault, get, put, requireThat, roles, type Actor, type Data } from './types';

const fields = ['tin', 'bankAccount', 'bankRouting'] as const;
type Field = typeof fields[number];
type CipherRow = { supplier: string; field: Field; key_id: string; nonce: string; ciphertext: string; tag: string };
const unavailable = () => new Fault(503, 'Protected data key unavailable; restore the installation key or re-enter values');
function installationKey(env: Bindings) {
    if (!/^[a-f0-9]{64}$/i.test(env.PROTECTED_DATA_KEY ?? '')) throw unavailable();
    const bytes = Buffer.from(env.PROTECTED_DATA_KEY!, 'hex');
    return { bytes, id: createHash('sha256').update(bytes).digest('hex') };
}
const aad = (supplier: string, field: Field, keyId: string) => Buffer.from(JSON.stringify(['main', supplier, field, keyId]));
function encrypt(env: Bindings, supplier: string, field: Field, value: string, reason: string, evidence: string) {
    const key = installationKey(env), nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key.bytes, nonce);
    cipher.setAAD(aad(supplier, field, key.id));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ value, reason, evidence }), 'utf8'), cipher.final()]);
    return { supplier, field, key_id: key.id, nonce: Buffer.from(nonce).toString('base64'), ciphertext: ciphertext.toString('base64'), tag: Buffer.from(cipher.getAuthTag()).toString('base64') };
}
function decrypt(env: Bindings, row: CipherRow): string {
    const key = installationKey(env);
    try {
        if (row.key_id !== key.id) throw unavailable();
        const decipher = createDecipheriv('aes-256-gcm', key.bytes, Buffer.from(row.nonce, 'base64'));
        decipher.setAAD(aad(row.supplier, row.field, row.key_id));
        decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
        const plaintext = Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]);
        return JSON.parse(plaintext.toString('utf8')).value;
    } catch { throw unavailable(); }
}
const privateText = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 2000;
async function rows(env: Bindings, supplier: string) {
    return (await env.DB.prepare("SELECT * FROM p_supplier_protected WHERE business='main' AND supplier=?").bind(supplier).all<CipherRow>()).results;
}
async function proof(env: Bindings, a: Actor, since: number) {
    const row = await env.DB.prepare('SELECT 1 AS ok FROM oa_step_up_challenges WHERE session_id=? AND operator_id=? AND operator_version=? AND consumed_at>=? AND consumed_at<=? LIMIT 1').bind(a.session, a.id, a.version, since, Date.now()).first();
    requireThat(row, 'Native reauthentication required within ten minutes', 403);
}

function protectedBankStatus(supplier: Data, stored: CipherRow[]) {
    if (stored.some(row => row.field === 'bankAccount' || row.field === 'bankRouting')) return 'Recorded, not verified – not active for payment';
    return supplier.protectedOnFile?.bankAccount || supplier.protectedOnFile?.bankRouting ? 'Not restored – re-enter' : 'Not recorded';
}

function protectedMasks(env: Bindings, supplier: Data, a: Actor, capabilities: string[], stored: CipherRow[]) {
    const masks: Data = {};
    for (const field of fields) {
        const row = stored.find(r => r.field === field), existed = supplier.protectedOnFile?.[field];
        if (!row) { if (existed && (field !== 'bankRouting' || a.owner || capabilities.includes('buyer'))) masks[field] = 'Not restored – re-enter'; continue; }
        if (a.owner || capabilities.includes('buyer')) masks[field] = '••••' + decrypt(env, row).slice(-4);
        else if (field !== 'bankRouting') masks[field] = 'On file';
    }
    return masks;
}
export async function protectedSupplierState(env: Bindings, a: Actor, capabilities: string[], suppliers: Data[]) {
    const stored = (await env.DB.prepare("SELECT * FROM p_supplier_protected WHERE business='main'").all<CipherRow>()).results;
    return new Map(suppliers.map(supplier => [supplier.id, protectedMasks(env,supplier,a,capabilities,stored.filter(row => row.supplier === supplier.id))]));
}

export const supplierProtectedApi = new Hono<{ Bindings: Bindings }>();
supplierProtectedApi.get('/api/purse/supplier-protected/:supplier', async c => {
    const env = runtimeBindings(c.env), a = await actor(c.req.raw, env), {state, revision} = await load(env.DB);
    const capabilities = roles(state, a); requireThat(capabilities.length, 'No active business membership', 403);
    const supplier = get(state, 'supplier', c.req.param('supplier')), stored = await rows(env, supplier.id);
    const masks = protectedMasks(env,supplier,a,capabilities,stored);
    await readFence(env.DB, a, revision);
    return c.json({ revision, supplier: supplier.id, masks, bankStatus: protectedBankStatus(supplier,stored) });
});
supplierProtectedApi.post('/api/purse/supplier-protected/:supplier/:operation', async c => {
    const env = runtimeBindings(c.env), a = await actor(c.req.raw, env), loaded = await load(env.DB);
    const {state, revision} = loaded, before = structuredClone(state), supplierId = c.req.param('supplier');
    const operation = c.req.param('operation');
    try {
        requireThat(a.owner, 'Current native owner required', 403);
        requireThat(['store', 'reveal'].includes(operation), 'Protected operation unavailable', 404);
        const raw = await c.req.text();
        requireThat(Buffer.byteLength(raw,'utf8') <= 12000, 'Protected input too large', 413);
        let body: Data;
        try { body = JSON.parse(raw); } catch { throw new Fault(400,'Protected input invalid'); }
        requireThat(body && typeof body === 'object' && !Array.isArray(body), 'Protected input invalid');
        requireThat(body.revision === revision, 'State changed; reload before trying again', 409);
        const supplier = get(state, 'supplier', supplierId);
        requireThat(privateText(body.reason), 'Private reason required');
        if (operation === 'store') {
            requireThat(!supplier.mergedInto, 'Merged supplier cannot receive new protected values', 409);
            requireThat(privateText(body.evidence), 'Private evidence reference required');
            requireThat(body.values && typeof body.values === 'object' && !Array.isArray(body.values), 'Protected values required');
            const supplied = Object.keys(body.values);
            requireThat(supplied.length > 0 && supplied.every(f => fields.includes(f as Field)), 'Protected fields invalid');
            requireThat(Boolean(body.values.bankAccount) === Boolean(body.values.bankRouting), 'Bank account and routing must be changed together');
            const values: Data = {};
            for (const field of supplied as Field[]) {
                const value = body.values[field];
                requireThat(typeof value === 'string' && (field === 'bankAccount' ? /^\d{4,17}$/ : /^\d{9}$/).test(value), 'Protected value format invalid');
                values[field] = value;
            }
            // Encrypt first: missing keys never commit a partial matching or product update.
            const encrypted = (supplied as Field[]).map(field => encrypt(env,supplier.id,field,values[field],body.reason,body.evidence));
            const matching = matchingInputs(state, values, supplier.matching);
            put(state,'supplier',supplier.id,{...supplier,matching,protectedOnFile:{...supplier.protectedOnFile,...Object.fromEntries(supplied.map(f => [f,true]))}});
            audit(state,a,'protected-store',supplier.id,{fields:supplied,reason:'Private reason and evidence retained encrypted'});
            const statements = encrypted.map(row => env.DB.prepare('INSERT INTO p_supplier_protected(business,supplier,field,key_id,nonce,ciphertext,tag) VALUES(?,?,?,?,?,?,?) ON CONFLICT(business,supplier,field) DO UPDATE SET key_id=excluded.key_id,nonce=excluded.nonce,ciphertext=excluded.ciphertext,tag=excluded.tag').bind('main',row.supplier,row.field,row.key_id,row.nonce,row.ciphertext,row.tag));
            await save(env.DB,a,before,state,revision,{statements});
            return c.json({stored:supplied,bankStatus:protectedBankStatus(supplier,await rows(env,supplier.id))});
        }
        requireThat(fields.includes(body.field), 'Choose one protected field');
        const since = Date.now()-10*60*1000;
        await proof(env,a,since);
        const stored = await rows(env,supplier.id), row = stored.find(r => r.field === body.field);
        requireThat(row,'Protected value not restored; re-enter',404);
        const value = decrypt(env,row);
        audit(state,a,'protected-reveal',supplier.id,{field:body.field,reason:'Private reason supplied'});
        // Same transaction settles current owner/session, product revision and fresh proof.
        await save(env.DB,a,before,state,revision,{statements:[],proofSince:since});
        return c.json({field:body.field,value});
    } catch (error) {
        // Only safe fixed vocabulary enters refusal history; input is never logged or echoed.
        if (error instanceof Fault && error.status !== 409) {
            const refused = structuredClone(before);
            audit(refused,a,'protected-refused','supplier-protected',{operation:operation==='store'?'store':operation==='reveal'?'reveal':'unavailable',reason:'Protected operation refused'});
            await save(env.DB,a,before,refused,revision);
        }
        if (error instanceof Fault) throw error;
        throw new Fault(400,'Protected input invalid');
    }
});
