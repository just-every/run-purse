import { validateOrderThreadObjects } from './restore-order-thread.mjs';
import { validateErasureObjects } from './restore-erasure.mjs';
import { migrateInvoiceArchive } from './migrate-invoice-archive.mjs';
import { hasUnsafeProtectedContext } from '../../src/purse/protected-context-fields.mjs';
import { validateSearchProjection } from './restore-search.mjs';
import { check, validatePurchasingArchive } from './restore-validation.mjs';
import { recordRestoreHistory } from './restore-history.mjs';
export default {
 product: 'just-every/procurement-purse',
 replaceableTables: ['p_meta'],
 excludeTables: ['p_report_keys','p_report_schedules','p_report_deliveries','p_comment_search','p_restore_history','p_order_thread_routes','p_pantry_credentials', 'p_order_send_links', 'p_scim_links', 'p_scim_authority', 'p_supplier_protected', 'p_search_fts', 'p_search_fts_data', 'p_search_fts_idx', 'p_search_fts_docsize', 'p_search_fts_config', 'p_search_fold', 'p_search_drop', 'p_integration_tokens', 'p_integration_requests', 'p_import_custody', 'p_supplier_document_links', 'p_rfq_links'],
 exportRow(table,row) {
  if(table!=='p_records')return row;
  const value=JSON.parse(row.value);
  if(row.kind==='erasureReceipt'&&value.phase!=='complete')throw new Error('Finish private original erasure before export');
  if(hasUnsafeProtectedContext(row.kind,value))throw new Error('Clean historical protected context before export');
  if(row.kind==='supplierMatchingKey')row.value=JSON.stringify({id:row.id,secret:null,notRestored:true});
  if(row.kind==='supplier'&&value.matching&&Object.keys(value.matching).length){value.matchingNotRestored=true;delete value.matching;row.value=JSON.stringify(value);}
  if(row.kind==='invoice'&&value.evidenceHash&&!value.evidence)throw new Error('Migrate legacy invoice evidence before export: '+row.id);
  return row;
 },
 requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
 buckets: { ORIGINALS: {} },
 validateStaged: async ({ db, tables, read, manifest }) => {
  const rows = await migrateInvoiceArchive({rows:await read('p_records'),db,tables,manifest,check});
  validatePurchasingArchive(rows);
  validateOrderThreadObjects(rows,await read('p_order_thread_receipts'),manifest,check);
  validateErasureObjects(rows,manifest,check);
  validateSearchProjection(rows, await read('p_search'), check);
  for (const row of rows.filter(row => row.kind === 'rfqResponse')) for (const file of JSON.parse(row.value).files) if (file.key && !file.erasure) {
   const object = manifest.objects.find(object => object.bucket === 'ORIGINALS' && object.key === file.key);
   check(object && object.size === file.size && object.sha256 === file.sha256, 'rfq_original_inventory');
  }
  for (const row of rows.filter(row => ['emailIntake', 'apInvoiceEmail'].includes(row.kind))) {
   const intake = JSON.parse(row.value);
   for (const file of [intake.original, ...intake.files, ...(intake.embedded ?? [])]) {
    if(file.erasure)continue;
    const object = manifest.objects.find(object => object.bucket === 'ORIGINALS' && object.key === file.key);
    check(object && object.size === file.size && object.sha256 === file.sha256, 'email_intake_original_inventory');
   }
  }
  const receipts = await read('p_email_intake_receipts');
  for (const receipt of receipts) {
   check(receipt.provider === 'resend' && /^[a-zA-Z0-9_-]{1,128}$/.test(receipt.email_id) && typeof receipt.intake_id === 'string' && Number.isFinite(Date.parse(receipt.created_at)) && ['claimed','stored','uncertain'].includes(receipt.status), 'email_intake_receipt_shape');
   if (receipt.status === 'stored') check(rows.some(row => ['emailIntake', 'apInvoiceEmail'].includes(row.kind) && row.id === receipt.intake_id && JSON.parse(row.value).providerEmailId === receipt.email_id), 'email_intake_stored_receipt');
  }
  for (const row of rows.filter(row => ['emailIntake', 'apInvoiceEmail'].includes(row.kind))) {
   const intake = JSON.parse(row.value);
   check(receipts.some(receipt => receipt.provider === intake.provider && receipt.email_id === intake.providerEmailId && receipt.intake_id === intake.id && receipt.status === 'stored'), 'email_intake_receipt');
  }
  await recordRestoreHistory({db,manifest,check});
  return true;
 },
};
