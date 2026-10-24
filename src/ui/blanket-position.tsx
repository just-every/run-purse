import { Separated } from './separated';
import { money, type D } from './shared';
export function BlanketPosition({ order }: { order: D }) {
    const p = order.blanketPosition;
    if (!p) return null;
    // Billed balances reach only readers of every invoice they sum.
    const billed = p.billedMinor !== undefined;
    return <Separated><section aria-label="Blanket balance"><h4>Blanket invoice draw-down</h4><p>Valid {p.validFrom} through {p.validThrough} (inclusive)</p><p>Approved cap {money(p.capMinor, order.currency)}{billed && <> · Invoice evidence {money(p.billedMinor, order.currency)} · Remaining cap {money(p.remainingMinor, order.currency)}</>}</p>{p.overCapMinor > 0 && <p role="alert">Over cap by {money(p.overCapMinor, order.currency)}. Review invoice risk and matching exceptions.</p>}{billed && <p className="quiet">All invoice evidence counts once across issued amendments, including held evidence. These figures do not establish payment or supplier delivery.</p>}</section></Separated>;
}
