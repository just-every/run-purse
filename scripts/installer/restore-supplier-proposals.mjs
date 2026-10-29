/** Review records restore as history; no decision restores activation authority. */
export function validateSupplierProposals(all,get,check) {
    for(const proposal of all('supplierProposal')) {
        const supplier=get('supplier',proposal.supplier);
        const guidedStatus = proposal.source !== 'standalone' && proposal.status === 'pending' && ['active','preferred','pending_review','blocked'].includes(supplier.status);
        check(proposal.id===supplier.id&&['pending','rejected'].includes(proposal.status)&&(['proposed','rejected'].includes(supplier.status)||guidedStatus),'supplier_proposal_status');
        check(Number.isSafeInteger(proposal.version??1)&&(proposal.version??1)>0&&typeof proposal.requesterEmail==='string'&&Number.isFinite(Date.parse(proposal.at)),'supplier_proposal');
        if(proposal.status==='rejected')check(get('supplierProposalReview',proposal.review).proposal===proposal.id&&supplier.status==='rejected','supplier_proposal_rejection');
        else check(!proposal.review&&(supplier.status==='proposed'||guidedStatus),'supplier_proposal_pending');
    }
    for(const review of all('supplierProposalReview')) {
        const proposal=get('supplierProposal',review.proposal);
        check(review.supplier===proposal.supplier&&proposal.review===review.id&&review.decision==='rejected'&&typeof review.reason==='string'&&review.reason.trim()&&typeof review.actor==='string'&&Number.isInteger(review.operatorVersion)&&Number.isFinite(Date.parse(review.at)),'supplier_proposal_review');
        check(Array.isArray(review.requests)&&Array.isArray(review.releases)&&new Set(review.releases).size===review.releases.length,'supplier_proposal_sources');
        for(const source of review.requests)check(get('revision',source.id+':'+source.revision).supplier===review.supplier,'supplier_proposal_request');
        for(const id of review.releases) {
            const event=get('commitment',id);
            check(event.review===review.id&&event.kind==='supplier-rejection-release'&&event.amountMinor<0&&review.requests.some(r=>r.id===event.request&&r.revision===event.revision),'supplier_proposal_release');
        }
        check(all('audit').some(event=>event.action==='supplier-proposal-reject'&&event.review===review.id),'supplier_proposal_review_audit');
    }
}
