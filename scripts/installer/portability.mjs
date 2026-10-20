import { check, validatePurchasingArchive } from './restore-validation.mjs';
export default {
 product: 'just-every/procurement-purse',
 replaceableTables: ['p_meta'],
 excludeTables: ['p_search_fts', 'p_search_fts_data', 'p_search_fts_idx', 'p_search_fts_docsize', 'p_search_fts_config', 'p_search_fold', 'p_search_drop', 'p_integration_tokens', 'p_integration_requests', 'p_import_custody', 'p_supplier_document_links', 'p_rfq_links'],
 requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
 buckets: { ORIGINALS: {} },
 validateStaged: async ({ read, manifest }) => {
  const rows = await read('p_records');
  validatePurchasingArchive(rows);
  for (const row of rows.filter(row => row.kind === 'rfqResponse')) for (const file of JSON.parse(row.value).files) if (file.key) {
   const object = manifest.objects.find(object => object.bucket === 'ORIGINALS' && object.key === file.key);
   check(object && object.size === file.size && object.sha256 === file.sha256, 'rfq_original_inventory');
  }
  for (const row of rows.filter(row => row.kind === 'emailIntake')) {
   const intake = JSON.parse(row.value);
   for (const file of [intake.original, ...intake.files]) {
    const object = manifest.objects.find(object => object.bucket === 'ORIGINALS' && object.key === file.key);
    check(object && object.size === file.size && object.sha256 === file.sha256, 'email_intake_original_inventory');
   }
  }
  const receipts = await read('p_email_intake_receipts');
  for (const receipt of receipts) {
   check(receipt.provider === 'resend' && /^[a-zA-Z0-9_-]{1,128}$/.test(receipt.email_id) && typeof receipt.intake_id === 'string' && Number.isFinite(Date.parse(receipt.created_at)) && ['claimed','stored','uncertain'].includes(receipt.status), 'email_intake_receipt_shape');
   if (receipt.status === 'stored') check(rows.some(row => row.kind === 'emailIntake' && row.id === receipt.intake_id && JSON.parse(row.value).providerEmailId === receipt.email_id), 'email_intake_stored_receipt');
  }
  for (const row of rows.filter(row => row.kind === 'emailIntake')) {
   const intake = JSON.parse(row.value);
   check(receipts.some(receipt => receipt.provider === intake.provider && receipt.email_id === intake.providerEmailId && receipt.intake_id === intake.id && receipt.status === 'stored'), 'email_intake_receipt');
  }
  return true;
 },
};
