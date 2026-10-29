import { RequestSupplierReview } from './supplier-proposals';
import { RequestReviews } from './request-reviews';
import { Comments } from './comments';
import { PriceBenchmark } from './price-benchmark';
import { CodingAgent } from './coding-agent';
import {QuoteAgent} from './quote-agent';
import { OrderSupplierSend } from './order-supplier-send';
import { BudgetReview } from './budget-review';
import { TravelRequestRecord } from './travel-record';
import { policyOf } from './thread-model';
import { PendingHeaderEdit } from './pending-header-edit';
import { IntakeValues } from './intake-values';
import { ConversionVariance, ConversionHistory, NeedDateEdit } from './conversion-variance';
import { RequestAgain } from './request-again';
import { Separated } from './separated';
import { EmailSource } from './email-intake';
import { Rfq } from './rfq';
import { QuoteReading } from './quote-reading';
import { QuoteAward } from './quote-award';
import { Form, Field, Table, Attachments, Details, money, when, type D } from './shared';
import { RequestForm } from './request-form';
import type { RefObject } from 'react';
/** A term a supplier left out, on a pale cell. */
const Missing = () => <span className="missing">Missing</span>;
/** One request opened in full under its card: lines, the requester's and approver's actions, quotes, evidence and history. */
export function RequestRecord({ data, actor, mutate, current, heading, close }: {
    data: D;
    actor: D;
    mutate: (op: string, b: D) => Promise<any>;
    current: D;
    heading: RefObject<HTMLHeadingElement | null>;
    close: () => void;
}) {
    if (current.purchaseType === 'travel') return <TravelRequestRecord data={data} actor={actor} mutate={mutate} current={current} heading={heading} close={close}/>;
    const id = current.id;
    return <Separated><section className="record" key={id}><h3 className="record-title" ref={heading} tabIndex={-1}>{current.title} · revision {current.revision}</h3><p className="record-meta">Supplier: {current.supplierSnapshot?.name}</p><p className="record-terms">{current.terms}</p>{current.approvalPreview?.length > 0 && <section aria-label="Approval route"><h4>Approval route</h4><ol>{current.approvalPreview.map((step:D)=><li key={step.id}>{step.mode === 'any' ? 'Any one of' : step.mode === 'all' ? 'All of' : 'Approver'} · {step.emails.join(', ')} · {step.reason}{step.decidedBy && <> · Decided by {step.decidedBy}</>}</li>)}</ol></section>}{current.valuePromise&&<p>Promised outcome · exact revision {current.revision}: {current.valuePromise.kind==='seats'?current.valuePromise.seats+' active seats':current.valuePromise.kind==='need-date'?'Need met by '+current.valuePromise.needDate:money(current.valuePromise.amountMinor,current.valuePromise.currency)+' quoted saving; not realized savings'} · <a href={'/app?valueRequest='+current.id+'&valueRevision='+current.revision}>Review value evidence</a></p>}<Table heads={['Description', 'Quantity', 'Project / category', 'Price']} figures={['Quantity', 'Price']}>{current.lines.map((l: D) => <tr key={l.id}><td>{l.description}<br/>{l.partNumber} · {l.unit ?? 'each'}</td><td className="figure">{l.quantity}</td><td>{l.project} / {l.category}</td><td className="figure">{money(l.totalMinor, current.currency)}</td></tr>)}</Table><p className="record-sum"><span className="sum-item"><span className="sum-label">Freight</span> <span className="sum-amount">{money(current.freightMinor, current.currency)}</span></span><span className="sum-sep" aria-hidden="true"> · </span><span className="sum-item"><span className="sum-label">Supplied tax</span> <span className="sum-amount">{money(current.taxMinor, current.currency)}</span></span></p>{!current.imported && <>{current.mayEdit && (actor.roles.includes('owner') || current.requester === actor.id || current.requesterEmail === actor.email) && ['draft', 'returned', 'rejected'].includes(current.status) && current.supplierReview?.status!=='rejected' && <Form label="Submit for approval" initial={{ id, revision: current.revision }} onSubmit={b => mutate('submit', b)}><p>Approve exactly these lines, supplier and terms through the matching authority policy.</p></Form>}{current.mayApprove && current.status === 'pending' && <Form label="Record decision" initial={{ id, revision: current.revision, chainStep: current.approvalStep, approvalAttempt:current.approvalAttempt }} onSubmit={b => mutate('decision', b)}><Field label="Decision" name="decision" options={['approved', 'returned', 'rejected'].map(x => ({ value: x, label: x }))}/><Field label="Decision reason" name="reason"/></Form>}{current.mayConvert && current.status === 'approved' && <><Form label="Generate purchase order" initial={{ id, revision: current.revision }} onSubmit={b => mutate('convert', b)}><p>Generation allocates these approved lines once. Issue the document separately in Orders.</p></Form><ConversionVariance request={current} limit={current.buyerLimit} suppliers={data.supplier} mutate={mutate}/></>}{current.mayEdit && <Details label="Revise or amend request"><RequestForm key={current.revision} data={data} current={current} mutate={mutate}/></Details>}</>}
 <RequestSupplierReview request={current}/><RequestReviews current={current} data={data} mutate={mutate}/>
 {!current.imported && current.purchaseType !== 'travel' && <Comments key={current.id} kind="request" record={current.id} mutate={mutate}/>}
 <BudgetReview data={data} request={current}/>
 <PriceBenchmark data={data} current={current} mutate={mutate}/>
 <CodingAgent data={data} current={current} mutate={mutate}/>
 <RequestAgain kind="request" source={current} data={data} actor={actor} mutate={mutate}/>
 {current.lines.some((l: D) => l.requiredAttachments?.length) && <p className="quiet">Required catalogue files: {[...new Set(current.lines.flatMap((l: D) => l.requiredAttachments ?? []))].join(', ')}</p>}{current.emailIntake && data.emailIntake?.find((i: D) => i.id === current.emailIntake) && <EmailSource intake={data.emailIntake.find((i: D) => i.id === current.emailIntake)}/>}<IntakeValues form={data.intakeForm?.find((f:D)=>f.id===current.intakeForm)} values={current}/><Attachments data={data} kind="request" record={id} editable={Boolean(current.mayEdit)} mutate={mutate}/><QuoteReading data={data} current={current} actor={actor} mutate={mutate}/><Rfq data={data} current={current} actor={actor} mutate={mutate}/><QuoteAgent data={data} current={current} mutate={mutate}/><NeedDateEdit request={current} mutate={mutate}/>{data.order.filter((order:D)=>order.request===current.id && order.revision===current.revision && (order.supplierChange||order.supplierInitial)).map((order:D)=><OrderSupplierSend key={order.id} order={order} maySend={order.mayIssue}/>)}<ConversionHistory request={current} orders={data.order}/><PendingHeaderEdit current={current} data={data} mutate={mutate}/><h3>Quote comparison</h3><p className="quiet">Each currency is a separate comparison. Missing terms stay visible.</p>{[...new Set(data.quote.filter((q: D) => q.request === id).map((q: D) => q.currency))].map((c: any) => <section key={c}><h4>{c}</h4><Table heads={['Supplier', 'Price', 'Freight', 'Supplied tax', 'Delivery', 'Conditions / missing', 'Source']} figures={['Price', 'Freight', 'Supplied tax']}>{data.quote.filter((q: D) => q.request === id && q.currency === c).map((q: D) => <tr key={q.id}><td>{data.supplier.find((s: D) => s.id === q.supplier)?.name}</td><td className="figure">{money(q.lines.reduce((n: number, l: D) => n + l.totalMinor, 0), c)}</td><td className="figure">{q.freightMinor === null ? <Missing/> : money(q.freightMinor, c)}</td><td className="figure">{q.taxMinor === null ? <Missing/> : money(q.taxMinor, c)}</td><td className="figure-cell">{q.delivery || q.leadTime || <Missing/>}</td><td>{q.conditions || <Missing/>}{q.validity&&<p>Validity: {q.validity}</p>}</td><td>{q.source}</td></tr>)}</Table></section>)}{current.mayEdit && !current.imported && <Details label="Add supplied quotation"><RequestForm data={data} current={current} quote mutate={mutate}/></Details>}<QuoteAward data={data} current={current} actor={actor} mutate={mutate}/><h3>Decision history</h3><ul className="ruled-list">{data.decision.filter((d: D) => d.request === id).map((d: D) => <li key={d.id}>Revision {d.revision} · {d.decision} · {d.email} · {when(d.at)} · {d.reason}{d.delegation ? ' · Delegated' : ''}</li>)}</ul><Details label="Revision history">{data.revision.filter((r: D) => r.request === id).map((r: D) => <p key={r.revision}>v{r.revision} · {r.title} · {r.supplierSnapshot?.name} · {money(r.totalMinor, r.currency)} · {r.lines.map((l: D) => l.description + ' × ' + l.quantity).join('; ')}</p>)}</Details><div className="record-end"><button onClick={close}>Close request</button></div></section></Separated>;
}
