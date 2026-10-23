import { createHash } from 'node:crypto';
export function validatePantry(all,get,check) {
 for(const config of all('pantryConfig'))check(config.id==='main'&&/^https?:\/\//.test(config.origin)&&/^[A-Z]{3}$/.test(config.currency),'pantry_config');
 for(const sync of all('pantrySync')) {
  const invoice=get('invoice',sync.invoice),order=get('order',sync.order);get('supplier',sync.supplier);
  check(sync.id===invoice.id&&invoice.order===order.id&&sync.supplier===order.supplier&&sync.currency===invoice.currency&&['attempting','held','synced'].includes(sync.status),'pantry_source');
  const source=Object.fromEntries(['invoice','order','supplier','supplierName','currency','payableVersion','term','discountDate','discountPercent','origin','vendorId','accountId','payload'].map(key=>[key,sync[key]]));
  check(createHash('sha256').update(JSON.stringify(source)).digest('hex')===sync.fingerprint,'pantry_source_digest');
  check(sync.payload.lines.reduce((sum,line)=>sum+Math.round(Number(line.amount)*100),0)===invoice.totalMinor,'pantry_source_total');
  if(sync.returned){const returned=sync.returned;
   check(sync.externalId===returned.externalId&&sync.externalVendorId===returned.vendorId&&returned.reference===invoice.reference&&returned.totalMinor===invoice.totalMinor,'pantry_return_identity');
   check(Number.isSafeInteger(returned.openMinor)&&returned.openMinor>=0&&returned.openMinor<=invoice.totalMinor&&Number.isSafeInteger(returned.paidMinor)&&returned.paidMinor>=0&&returned.paidMinor<=invoice.totalMinor,'pantry_return_amount');
   check(['paid','partially-paid','unpaid','settled-without-payment','void'].includes(returned.paymentStatus)&&returned.reconciliationStatus==='unknown','pantry_return_status');
   check(returned.paidMinor===returned.payments.reduce((sum,payment)=>sum+payment.allocations.reduce((n,a)=>n+a.amountMinor,0),0),'pantry_payment_allocations');
   check(invoice.pantry?.externalId===sync.externalId&&invoice.pantry.openMinor===returned.openMinor&&invoice.pantry.paidMinor===returned.paidMinor,'pantry_invoice_return');
  }
 }
 for(const invoice of all('invoice'))if(invoice.pantry)check(all('pantrySync').some(sync=>sync.invoice===invoice.id&&sync.returned),'pantry_invoice_link');
}
