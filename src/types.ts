export const HIO_PROTOCOL_VERSION = 3 as const;

export type RequestType =
  "inform" | "collect" | "authorize" | "escalate" | "result";

export type UrgencyLevel = "low" | "normal" | "high" | "critical";

export type RiskLevel = "low" | "medium" | "high" | "irreversible";

export type BoundaryOutcome = "allowed" | "forbidden" | "ask_first" | "stop";

export type AskFirstPlaintext = {
  schemaVersion: typeof HIO_PROTOCOL_VERSION;
  type: RequestType;
  title: string;
  summary: string;
  urgency: UrgencyLevel;
  riskLevel: RiskLevel;
};

export type InterpretedBoundary = {
  outcome: BoundaryOutcome;
  sectionId?: string;
  riskLevel?: RiskLevel;
  summary?: string;
};

export type EncryptedRequestEnvelope = {
  schemaVersion: typeof HIO_PROTOCOL_VERSION;
  cardSlug: string;
  cardUpdatedAtSeen?: string;
  cardSchemaVersionSeen?: number;
  interpretedBoundary?: InterpretedBoundary;
  publicKeyId?: string;
  encryptedPayload: string;
  encryption: {
    scheme: "sealed_box_v1";
    nonce: string;
  };
};

export type CardRequestPolicy = {
  acceptsRequests: boolean;
  endpoint: string;
  encryption: "required";
  publicKeyId: string | null;
  publicEncryptionKey: string | null;
};

export type CardJson = {
  schemaVersion: typeof HIO_PROTOCOL_VERSION;
  card: {
    slug: string;
    updatedAt: string;
    requestPolicy: CardRequestPolicy;
  };
};

export type ResolvedCard = {
  slug: string;
  cardUrl: string;
  cardJson: string;
  cardMarkdown: string;
};

export type AskFirstResult = {
  accepted: boolean;
  receivedAt: string;
  receiptUrl: string;
  receiptId: string;
};

export type AnchorStatus =
  "pending" | "queued" | "anchored" | "failed" | "unavailable";

export type DelegationReceipt = {
  schema: string;
  schemaVersion: typeof HIO_PROTOCOL_VERSION;
  receipt: {
    id: string;
    kind: "ask_first_inbox_note";
    createdAt: string;
    agentName?: string | null;
    interpretedBoundary?: InterpretedBoundary;
  };
  card: {
    slug: string;
    schemaVersion: number;
    updatedAt: string;
  };
  hashes: {
    payloadHash: string;
    recordHash: string;
    previousRecordHash?: string | null;
  };
  anchor: {
    status: AnchorStatus;
    network?: string | null;
    transactionHash?: string | null;
    anchoredAt?: string | null;
  };
};

export type BuildAskFirstEnvelopeInput = {
  cardSlug: string;
  cardUpdatedAt: string;
  cardSchemaVersion: number;
  publicEncryptionKey: string;
  publicKeyId?: string | null;
  plaintext: AskFirstPlaintext;
  interpretedBoundary?: InterpretedBoundary;
};
