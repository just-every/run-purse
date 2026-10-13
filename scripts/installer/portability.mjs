import { validatePurchasingArchive } from './restore-validation.mjs';
export default {
 product: 'just-every/procurement-purse',
 replaceableTables: ['p_meta'],
 excludeTables: ['p_import_custody'],
 requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
 validateStaged: async ({ read }) => validatePurchasingArchive(await read('p_records')),
};
