export interface InboundLimits { maxRawBytes: number; maxBodyBytes: number; maxAttachments: number; maxAttachmentBytes: number; maxTotalAttachmentBytes: number }
export interface InboundMail { provider: string; messageId: string | null; from: string; to: string[]; subject: string; text: string | null; html: string | null; attachments: {filename: string; contentType: string; content: Uint8Array; contentId: string | null}[] }
export function normalizeInbound(input: {provider: 'resend'; email: Record<string, any>; signedEmailId: string; fetchAttachment: (expected: Record<string, any>) => Promise<Uint8Array>}, limits: InboundLimits): Promise<InboundMail>;
export function createResendAttachmentFetcher(config: {apiKey?: string; maxAttachmentBytes: number}): (expected: Record<string, any>) => Promise<Uint8Array>;
export function verifyWebhook(input: {provider: 'resend'; rawBody: Uint8Array; headers: Headers; key: string; now: number}): Promise<boolean>;
export function readStream(stream: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array<ArrayBuffer>>;
