// Only native purchasing projections are published. Storage kinds and credentials
// do not become resources merely because they exist in the database.
export const recordKinds = [
  'request', 'supplier', 'catalogue', 'order', 'receipt', 'invoice', 'agreement',
  'policy', 'agentRun', 'revision', 'proposedAction',
  'decision', 'commitment', 'quote', 'quoteAward', 'orderClosure',
  'catalogueBundle', 'stockroom', 'supplierProposal', 'supplierDocument',
  'supplierDocumentReminder', 'supplierDocumentSubmission', 'attachment',
  'supplierMerge', 'supplierIssue', 'supplierOrderEvidence',
  'supplierRma', 'supplierCredit', 'supplierCreditApplication',
  'rfq', 'rfqResponse', 'rfqMailEvent', 'quoteReading', 'quoteReadingEvent',
  'invoiceSource', 'invoiceReading', 'invoiceReadingEvent', 'apInvoiceEmail',
  'supplierInvoiceSubmission',
  'agreementInvoice', 'agreementAward', 'agreementReminder',
  'agreementReading', 'agreementReadingEvent',
  'payable', 'cashExpectation', 'deposit', 'depositApplication', 'orderAdoption',
  'intakeDraft', 'travelReference', 'travelRelease', 'travelExpense',
  'valueCheckin', 'valueSeatImport', 'valueConfirmation',
  'recurringSeries', 'recurringEvent', 'recurringScenario', 'recurringNoticeSend',
  'agreementDisposition', 'recurringDiscoveryNotice', 'recurringScenarioConsent',
  'recurringScenarioDraft', 'codingExample', 'codingReview', 'invoiceCoding',
  'comment', 'notification', 'invoiceException', 'savedReport', 'orderThreadMessage',
  'lateOrderNotice', 'orderChaseEvent', 'poGenerationEvent', 'receiptPromptEvent',
] as const
export const recordUri = (kind: string, id: string) => `purse://${kind}/${encodeURIComponent(id)}`
