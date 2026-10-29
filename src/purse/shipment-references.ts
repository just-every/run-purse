import { all, requireThat, text, type Data, type State } from './types';

export const shipmentCarriers = ['UPS', 'FedEx', 'USPS', 'DHL'];
export function shipmentHistory(state: State, order: string) {
    return all(state, 'shipmentReference').filter(entry => entry.order === order)
        .sort((left, right) => left.version - right.version);
}
export function ordinaryShipmentOrder(order: Data) {
    return !order.imported && !order.adoption && !order.poDetails?.blanket && !order.recurring
        && (!order.purchaseType || order.purchaseType === 'goods') && order.lines.every((line: Data) => !line.service);
}

/** An optional reference is evidence from the same exact-response capability. */
export function prepareShipmentReference(state: State, order: Data, event: Data, response: Data, body: Data) {
    requireThat(body.order === undefined || body.order === order.id, 'Shipment belongs to another order', 409);
    if (body.shipment === undefined) return null;
    const input = body.shipment;
    requireThat(event.mode === 'initial' && ordinaryShipmentOrder(order), 'Shipment references require an initial ordinary-goods order', 409);
    requireThat(input && typeof input === 'object' && !Array.isArray(input), 'Shipment reference object required');
    requireThat(response.decision !== 'reject', 'A rejected order cannot report a shipment', 409);
    requireThat(input.order === undefined || input.order === order.id, 'Shipment belongs to another order', 409);
    requireThat(shipmentCarriers.includes(input.carrier), 'Choose UPS, FedEx, USPS or DHL');
    requireThat(typeof input.trackingNumber === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{5,79}$/.test(input.trackingNumber), 'Tracking number must contain 6 to 80 letters, digits or hyphens');
    const history = shipmentHistory(state, order.id), correctionOf = input.correctionOf ? text(input.correctionOf, 'Reference to correct', 250) : null;
    requireThat(history.length < 100, 'This order has reached its shipment-reference limit', 409);
    const corrected = correctionOf && history.find(entry => entry.id === correctionOf);
    requireThat(!correctionOf || corrected && !corrected.erasure && corrected.send === event.id
        && !history.some(entry => entry.correctionOf === correctionOf), 'Choose a current reference from this exact order and send', 409);
    const active = history.filter(entry => !entry.erasure && !history.some(next => next.correctionOf === entry.id));
    requireThat(!active.some(entry => entry.carrier === input.carrier && entry.trackingNumber.toUpperCase() === input.trackingNumber.toUpperCase()), 'This shipment reference is already recorded', 409);
    return { id: response.id, order: order.id, request: order.request, send: event.id, revision: event.revision,
        response: response.id, version: history.length + 1, carrier: input.carrier, trackingNumber: input.trackingNumber,
        correctionOf, reason: correctionOf ? text(input.reason, 'Correction reason', 500) : null,
        source: 'supplier-reported', carrierStatus: 'unknown', actor: 'supplier-link', identityVerified: false, at: response.at };
}
