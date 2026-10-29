import { createHash } from 'node:crypto';
import { erasedSourceFact } from '../../src/purse/erasure-journal.mjs';
import { containsProtectedInput } from '../../src/purse/protected-context-fields.mjs';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const fact = line => ({line:line.id,partNumber:typeof line.partNumber==='string'?line.partNumber:'',unit:line.unit,unitMinor:line.unitMinor});
const sameSource = (source,mapping) => source.kind===mapping.kind && source.id===mapping.id && source.line===mapping.line && source.agreementVersion===mapping.agreementVersion;

/** A restored benchmark is immutable evidence, with no portable enablement or executable proposal. */
export function validatePriceBenchmarks(all, get, check) {
 for (const run of all('agentRun').filter(row => row.agent === 'AGENT-009')) {
  const revision = get('revision',run.request+':'+run.revision), input = run.inputs;
  check(run.workflow==='price-benchmark' && run.algorithm==='native-price-benchmark-v1' && run.mode==='deterministic v1'
   && run.model==='none' && run.provider==='none' && run.version===1 && Number.isFinite(Date.parse(run.at))
   && !containsProtectedInput(run), 'price_benchmark_execution');
  check(run.sourceValuesErased ? erasedSourceFact(all,'agentRun',run.id,run)
   : run.inputDigest===digest(input) && run.outputDigest===digest({results:run.results,outcomes:run.outcomes}), 'price_benchmark_digest');
  check(input.target.request===run.request && input.target.revision===run.revision && input.target.currency===revision.currency
   && same(input.target.lines,revision.lines.map(fact)) && input.actor===run.actor && input.operatorVersion===run.operatorVersion
   && input.reviewed===true && typeof input.reason==='string' && input.reason.trim().length>0, 'price_benchmark_target');
  check(Array.isArray(run.sources) && same(input.sources,run.sources) && run.sources.length>0
   && Array.isArray(input.mappings) && input.mappings.length>0 && input.mappings.length<=100
   && new Set(input.mappings.map(mapping=>JSON.stringify(mapping))).size===input.mappings.length, 'price_benchmark_mappings');
  check(run.references.length>0 && run.references.every(reference=>['request','revision','agentPolicy','order','quote','agreement','agreementAward'].includes(reference.kind)
   && typeof reference.version==='string' && get(reference.kind,reference.id)), 'price_benchmark_references');
  if (input.renewal) {
   const renewal=input.renewal, award=get('agreementAward',renewal.award), agreement=get('agreement',renewal.agreement);
   const version=agreement.history.find(row=>row.version===renewal.agreementVersion);
   check(award.agreement===agreement.id && award.agreementVersion===renewal.agreementVersion && award.request===run.request
    && award.revision===run.revision && version && renewal.startDate===version.startDate && renewal.endDate===version.endDate
    && renewal.noticeDeadline===version.noticeDeadline
    && run.references.some(ref=>ref.kind==='agreement'&&ref.id===agreement.id&&ref.version===renewal.agreementRecordVersion)
    && run.references.some(ref=>ref.kind==='agreementAward'&&ref.id===award.id&&ref.version===renewal.awardVersion), 'price_benchmark_renewal');
  }
  for (const control of input.governance) {
   const policy=get('agentPolicy',control.id), historical=policy.history[control.policyVersion-1];
   check(policy.agent==='AGENT-009' && historical?.enabled && run.references.some(ref=>ref.kind==='agentPolicy'&&ref.id===control.id&&ref.version===control.version), 'price_benchmark_governance');
  }
  for (const source of run.sources) {
   check(['order','quote','agreement'].includes(source.kind), 'price_benchmark_source_kind');
   if (source.kind==='agreement') {
    const agreement=get('agreement',source.id), version=agreement.history.find(row=>row.version===source.agreementVersion);
    const index=Number(source.line)-1, line=version?.priceLines?.[index];
    check(input.renewal?.agreement===source.id && source.agreementVersion<=input.renewal.agreementVersion
     && Number.isSafeInteger(index) && String(index+1)===source.line && line && source.partNumber===line.partNumber
     && source.unit===line.unit && source.unitMinor===line.awardedUnitMinor && source.currency===version.currency
     && source.supplier===version.supplier && source.at===version.at && source.startDate===version.startDate
     && source.endDate===version.endDate && source.noticeDeadline===version.noticeDeadline
     && source.dateBasis==='Agreement terms confirmed'
     && run.references.some(ref=>ref.kind==='agreement'&&ref.id===source.id&&ref.version===source.version), 'price_benchmark_agreement_source');
    check(Object.keys(source).every(key=>['kind','id','version','agreementVersion','supplier','line','partNumber','unit','unitMinor','currency','at','dateBasis','startDate','endDate','noticeDeadline','missing'].includes(key)), 'price_benchmark_safe_source');
    continue;
   }
   const record=get(source.kind,source.id), original=get('revision',source.request+':'+source.revision), line=record.lines.find(line=>line.id===source.line);
   check(record.request===source.request && record.revision===source.revision && source.currency===record.currency && source.supplier===record.supplier
    && line && same(fact(line),{line:source.line,partNumber:source.partNumber,unit:source.unit,unitMinor:source.unitMinor})
    && source.at===(source.kind==='order'?record.issuedAt:record.at) && !original.imported && !original.adoption
    && (source.kind!=='order'||record.issuedAt&&source.number===record.number)
    && run.references.some(ref=>ref.kind===source.kind&&ref.id===source.id&&ref.version===source.version)
    && run.references.some(ref=>ref.kind==='revision'&&ref.id===source.request+':'+source.revision&&ref.version===source.revisionVersion), 'price_benchmark_source');
   check(Object.keys(source).every(key=>['kind','id','version','request','revision','revisionVersion','supplier','number','line','partNumber','unit','unitMinor','currency','at','dateBasis','missing'].includes(key)), 'price_benchmark_safe_source');
  }
  for (const mapping of input.mappings) {
   const target=input.target.lines.find(line=>line.line===mapping.targetLine), source=run.sources.find(source=>sameSource(source,mapping));
   check(target && source && target.partNumber.trim().length>0 && target.partNumber===source.partNumber
    && target.unit===source.unit && input.target.currency===source.currency, 'price_benchmark_equivalence');
  }
  check(run.results.length===input.target.lines.length, 'price_benchmark_results');
  for (const [index,result] of run.results.entries()) {
   const target=input.target.lines[index], mappings=input.mappings.filter(mapping=>mapping.targetLine===target.line);
   const citations=mappings.map(mapping=>run.sources.find(source=>sameSource(source,mapping)));
   const minimum=citations.length?Math.min(target.unitMinor,...citations.map(source=>source.unitMinor)):null;
   check(result.line===target.line && result.partNumber===target.partNumber && result.unit===target.unit && result.unitMinor===target.unitMinor
    && result.currency===input.target.currency && same(result.citations,citations) && result.targetMinor===minimum
    && result.differenceMinor===(minimum===null?null:target.unitMinor-minimum) && Array.isArray(result.missing) && result.missing.length>0,
    'price_benchmark_calculation');
  }
  check(same(run.messages,[]) && same(run.proposals,[]) && same(run.outcomes,[{status:'nonbinding-brief',purchasingChange:'none',outbound:'none',offer:'none'}]), 'price_benchmark_nonbinding');
 }
}
