import { check, validatePurchasingArchive } from './restore-validation.mjs';
export default {
 product: 'just-every/procurement-purse',
 replaceableTables: ['p_meta'],
 excludeTables: ['p_import_custody', 'p_supplier_document_links', 'p_rfq_links'],
 requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
 buckets: { ORIGINALS: { prefix: 'rfq/' } },
 validateStaged: async ({ read, manifest }) => {
  const rows = await read('p_records');
  validatePurchasingArchive(rows);
  for (const row of rows.filter(row => row.kind === 'rfqResponse')) for (const file of JSON.parse(row.value).files) if (file.key) {
   const object = manifest.objects.find(object => object.bucket === 'ORIGINALS' && object.key === file.key);
   check(object && object.size === file.size && object.sha256 === file.sha256, 'rfq_original_inventory');
  }
  return true;
 },
};
