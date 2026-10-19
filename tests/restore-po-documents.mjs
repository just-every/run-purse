import assert from 'node:assert/strict';
import {pdfContent} from './pdf-content.mjs';
export async function restoredPoDocuments(context,origin,before,after,proofs){
 for(const proof of proofs.filter(p=>p.clause==='PO-009')){
  const original=before.order.find(o=>o.id===proof.order),restored=after.order.find(o=>o.id===proof.order);
  assert.deepEqual(restored.documentProfile,original.documentProfile,'PO-009 restores frozen profile, logo and exact original attachments');
  assert.deepEqual(restored.supplierSnapshot,original.supplierSnapshot,'PO-009 restores immutable supplier postal identity');
  const response=await context.request.get(origin+'/api/purse/order-pdf/'+restored.id);assert.equal(response.status(),200);
  const pdf=await pdfContent(new Uint8Array(await response.body()));assert.ok(pdf.text.includes(original.documentProfile.legalName),'PO-009 restored download retains legal identity');assert.ok(pdf.images>0,'PO-009 restored PDF retains its logo');
 }
}
