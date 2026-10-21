import { mayReadProtectedSupplier, protectedReadCapabilities } from './access-records';
import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { actor, load, readFence, save } from './store';
import { matchingInputs } from './supplier-identity';
import { audit, get, put, requireThat, roles, type Actor, type Data, type State } from './types';
import { protectedFields, protectedRows, decryptProtected, encryptProtected, writeProtected, type CipherRow, type ProtectedField } from './protected-crypto';
import { privateText, protectedBody, protectedProof, protectedRefusal } from './protected-controls';
import { protectedKeysApi } from './protected-keys';

const fields = protectedFields;
type Field = ProtectedField;
const rows = protectedRows;
const decrypt = (env: Bindings, row: CipherRow) => decryptProtected(env, row).value;

function protectedBankStatus(supplier: Data, stored: CipherRow[]) {
    if (stored.some(row => row.field === 'bankAccount' || row.field === 'bankRouting')) return 'Recorded, not verified – not active for payment';
    return supplier.protectedOnFile?.bankAccount || supplier.protectedOnFile?.bankRouting ? 'Not restored – re-enter' : 'Not recorded';
}

function protectedMasks(env: Bindings, supplier: Data, a: Actor, capabilities: string[], stored: CipherRow[], showUnavailable = false) {
    const masks: Data = {};
    for (const field of fields) {
        const row = stored.find(r => r.field === field), existed = supplier.protectedOnFile?.[field];
        if (!row) { if (existed && (field !== 'bankRouting' || a.owner || capabilities.includes('buyer'))) masks[field] = 'Not restored – re-enter'; continue; }
        if (a.owner || capabilities.includes('buyer')) {
            try { masks[field] = '••••' + decrypt(env, row).slice(-4); }
            catch (error) { if (!showUnavailable) throw error; masks[field] = 'Key unavailable – re-enter'; }
        }
        else if (field !== 'bankRouting') masks[field] = 'On file';
    }
    return masks;
}
export async function protectedSupplierState(env: Bindings, a: Actor, capabilities: string[], suppliers: Data[], state:State) {
    const stored = (await env.DB.prepare("SELECT * FROM p_supplier_protected WHERE business='main'").all<CipherRow>()).results;
    return new Map(suppliers.map(supplier => [supplier.id, protectedMasks(env,supplier,a,protectedReadCapabilities(state,a,supplier),stored.filter(row => row.supplier === supplier.id),true)]));
}

export const supplierProtectedApi = new Hono<{ Bindings: Bindings }>();
supplierProtectedApi.route('/', protectedKeysApi);
supplierProtectedApi.get('/api/purse/supplier-protected/:supplier', async c => {
    const env = runtimeBindings(c.env); let a: Actor | undefined;
    try {
        a = await actor(c.req.raw, env); const {state, revision} = await load(env.DB);
        const capabilities = roles(state, a); requireThat(capabilities.length, 'No active business membership', 403);
        const supplier = get(state, 'supplier', c.req.param('supplier')); requireThat(mayReadProtectedSupplier(state,a,supplier),'Supplier protected state outside your scope',403); const stored = await rows(env, supplier.id);
        const masks = protectedMasks(env,supplier,a,protectedReadCapabilities(state,a,supplier),stored);
        await readFence(env.DB, a, revision);
        return c.json({ revision, supplier: supplier.id, masks, bankStatus: protectedBankStatus(supplier,stored) });
    } catch (error) { return protectedRefusal(env, c.req.raw, 'read', error, a); }
});
supplierProtectedApi.post('/api/purse/supplier-protected/:supplier/:operation', async c => {
    const env = runtimeBindings(c.env); let a: Actor | undefined;
    const operation = c.req.param('operation');
    try {
        a = await actor(c.req.raw, env);
        const {state, revision} = await load(env.DB), before = structuredClone(state), supplierId = c.req.param('supplier');
        requireThat(a.owner, 'Current native owner required', 403);
        requireThat(['store', 'reveal'].includes(operation), 'Protected operation unavailable', 404);
        const body = await protectedBody(c.req.raw);
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
            const encrypted = (supplied as Field[]).map(field => encryptProtected(env,supplier.id,field,{value:values[field],reason:body.reason,evidence:body.evidence}));
            const matching = matchingInputs(state, values, supplier.matching);
            put(state,'supplier',supplier.id,{...supplier,matching,protectedOnFile:{...supplier.protectedOnFile,...Object.fromEntries(supplied.map(f => [f,true]))}});
            audit(state,a,'protected-store',supplier.id,{fields:supplied,reason:'Private reason and evidence retained encrypted'});
            const statements = encrypted.map(row => writeProtected(env, row));
            await save(env.DB,a,before,state,revision,{statements});
            return c.json({stored:supplied,bankStatus:protectedBankStatus(supplier,await rows(env,supplier.id))});
        }
        requireThat(fields.includes(body.field), 'Choose one protected field');
        const since = Date.now()-10*60*1000;
        await protectedProof(env,a,since);
        const stored = await rows(env,supplier.id), row = stored.find(r => r.field === body.field);
        requireThat(row,'Protected value not restored; re-enter',404);
        const value = decrypt(env,row);
        audit(state,a,'protected-reveal',supplier.id,{field:body.field,reason:'Private reason supplied'});
        // Same transaction settles current owner/session, product revision and fresh proof.
        await save(env.DB,a,before,state,revision,{statements:[],proofSince:since});
        return c.json({field:body.field,value});
    } catch (error) { return protectedRefusal(env, c.req.raw, operation, error, a); }
});
