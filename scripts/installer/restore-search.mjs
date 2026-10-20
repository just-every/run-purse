/** A portable search projection cannot add a source, invent an owner or expose a different record's metadata. */
export function validateSearchProjection(rows,index,check) {
 const supported=new Set(['request','order','invoice','receipt','supplier','catalogue','quoteReading','invoiceReading','agreement']);
 const records=new Map(rows.map(row=>[row.kind+':'+row.id,{...row,value:JSON.parse(row.value)}]));
 const expected=rows.filter(row=>supported.has(row.kind)||row.kind==='supplierDocument'&&JSON.parse(row.value).type==='agreement');
 check(index.length===expected.length,'search_projection_count');const seen=new Set();
 for(const row of index){const key=row.kind+':'+row.id,source=records.get(key);check(source&&row.business==='main'&&!seen.has(key),'search_projection_source');seen.add(key);const v=source.value;
  const text=(value)=>typeof value==='string'?value:'';
  for(const [field,value]of Object.entries({supplierId:text(v.supplier),requestId:text(v.request),orderId:text(v.order),requesterId:text(v.requester),requesterEmail:text(v.requesterEmail)}))check(row[field]===value,'search_projection_scope');
  const amount=Number.isInteger(v.totalMinor)?v.totalMinor:row.kind==='catalogue'&&Number.isInteger(v.unitMinor)?v.unitMinor:Number.isInteger(v.amounts?.totalMinor)?v.amounts.totalMinor:null;
  check(row.amountMinor===amount,'search_projection_amount');
  const title=text(v.title)||text(v.name)||text(v.description)||({supplierDocument:'Supplier agreement',invoiceReading:'Invoice document reading',quoteReading:'Quote document reading'}[row.kind]??row.kind);
  check(row.title===title,'search_projection_title');
  const number=text(v.number)||text(v.reference)||text(v.reference?.value)||text(v.partNumber)||text(v.sourceId);
  check(row.number===number,'search_projection_number');
  const names=[text(v.name),text(v.dba),text(v.supplierSnapshot?.name),text(v.supplierSnapshot?.dba),text(v.supplier?.value)].join(' ');
  check(row.names===names&&typeof row.namesKey==='string','search_projection_names');
  if(row.kind==='invoiceReading'||row.kind==='quoteReading')check(!/\b\d{8,}\b|\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/.test(text(v.searchText)),'search_projection_protected_text');
 }
}
