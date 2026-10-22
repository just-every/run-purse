export function validateAdoptionAmendments(all, get, check) {
    const proof = reference => {
        const revision = get('revision', reference.request + ':' + reference.revision), decision = get('decision', reference.decision);
        check(decision.request === reference.request && decision.revision === reference.revision && decision.decision === 'approved' && decision.actor !== revision.requester && decision.email !== revision.requesterEmail, 'adoption_disposition_approval');
        return revision;
    };
    for (const request of all('revision')) {
        if (request.cancellation) { const source = get('order', request.cancellation.order); check(request.amends === source.id && request.request === source.request && request.cancellation.number === source.number && Array.isArray(request.cancellation.lines) && request.cancellation.lines.length > 0, 'adoption_cancellation_source'); }
        if (request.adoptedDisposition) { const source = get('order', request.adoptedDisposition.order); check(source.request !== request.request && source.number === request.adoptedDisposition.number && /^[a-f0-9]{64}$/.test(request.adoptedDisposition.fingerprint) && Array.isArray(request.adoptedDisposition.lines) && request.adoptedDisposition.lines.length === request.lines.length && request.lines.every((line,index)=>line.q===request.adoptedDisposition.lines[index].q), 'adoption_replacement_source'); get('orderAdoption', request.adoptedDisposition.adoption); }
    }
    for (const receipt of all('receipt')) if (receipt.approvedDisposition) {
        const revision = proof(receipt.approvedDisposition), proposal = revision.cancellation ?? revision.adoptedDisposition, target = get('order', receipt.order);
        check(receipt.event === 'cancel' && proposal && proposal.lines.some(balance=>balance.line===receipt.line&&balance.q===receipt.q) && (revision.cancellation ? target.request===revision.request&&target.revision===revision.revision : receipt.order===proposal.order), 'adoption_disposition_receipt');
    }
    for (const order of all('order')) if (order.cancelledByApproval) {
        const revision = proof(order.cancelledByApproval), proposal = revision.cancellation ?? revision.adoptedDisposition;
        check(order.status === 'cancelled' && proposal && order.supplierCancellation === 'Not sent; native approval recorded' && all('audit').some(event=>event.action==='approved-adopted-cancellation'&&event.record===order.id&&event.decision===order.cancelledByApproval.decision), 'adoption_cancelled_order');
    }
}
