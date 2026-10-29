/** Keep portable history separate from installation-local supplier-link authority. */
export function validateShipmentReferences(all, get, check) {
    const references = all('shipmentReference'), audits = all('audit');
    for (const entry of references) {
        const order = get('order', entry.order), send = get('orderSend', entry.send), response = get('orderSupplierResponse', entry.response);
        const history = references.filter(prior => prior.order === order.id).sort((a, b) => a.version - b.version);
        check(send.mode === 'initial' && !order.imported && !order.adoption && !order.poDetails?.blanket && !order.recurring && (!order.purchaseType || order.purchaseType === 'goods') && order.lines.every(line => !line.service), 'shipment_source');
        check(entry.id === response.id && response.shipmentReference === entry.id && send.order === order.id && entry.request === order.request && response.order === order.id && response.send === send.id && entry.revision === send.revision && response.revision === entry.revision && response.decision !== 'reject' && entry.at === response.at, 'shipment_binding');
        check(history.length <= 100 && history.every((item, index) => item.version === index + 1), 'shipment_versions');
        check(['UPS','FedEx','USPS','DHL'].includes(entry.carrier) && entry.source === 'supplier-reported' && entry.carrierStatus === 'unknown' && entry.actor === 'supplier-link' && entry.identityVerified === false, 'shipment_provenance');
        check(entry.erasure ? entry.trackingNumber === 'Personal data erased' : typeof entry.trackingNumber === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{5,79}$/.test(entry.trackingNumber), 'shipment_number');
        if (entry.correctionOf) {
            const prior = get('shipmentReference', entry.correctionOf);
            check(prior.order === entry.order && prior.send === entry.send && prior.version < entry.version && references.filter(next => next.correctionOf === prior.id).length === 1 && typeof entry.reason === 'string' && entry.reason.trim().length && entry.reason.length <= 500, 'shipment_correction');
        } else check(entry.reason === null, 'shipment_reason');
        check(audits.some(audit => audit.action === 'shipment-reference-recorded' && audit.record === entry.order && audit.send === entry.send && audit.response === entry.response && audit.shipmentReference === entry.id && audit.revision === entry.revision && audit.carrier === entry.carrier && audit.trackingNumber === entry.trackingNumber && audit.correctionOf === entry.correctionOf && audit.reason === entry.reason && audit.at === entry.at), 'shipment_audit');
    }
    for (const response of all('orderSupplierResponse')) if (response.shipmentReference) check(get('shipmentReference', response.shipmentReference).response === response.id, 'shipment_response');
}
