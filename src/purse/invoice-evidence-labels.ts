export function evidenceLabel(e: Record<string, any> | undefined) {
 if(!e)return 'Legacy evidence not migrated – not verified.';
 if(e.state==='attested-at-migration')return `Checked at migration on ${e.at} from retained records. Later checks verify this migration record, not the original submission.`;
 if(e.state==='unavailable-source')return 'Original bank input not retained – legacy evidence not verified.';
 if(e.state==='did-not-verify')return 'Legacy evidence did not verify.';
 if(e.state==='verified-by-reentry')return `Verified by owner re-entry on ${e.at}. Later checks verify this re-entry record.`;
 return 'Retained invoice evidence verified. Bank comparison is not bank verification.';
}
