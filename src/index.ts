import { assertOkResponse } from "./errors.js";
import {
  buildAskFirstEnvelope,
  buildAskFirstEnvelopeFromCard,
} from "./envelope.js";
import type {
  AskFirstPlaintext,
  AskFirstResult,
  CardJson,
  DelegationReceipt,
  EncryptedRequestEnvelope,
  InterpretedBoundary,
  ResolvedCard,
} from "./types.js";

export type HioClientOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
};

export type { HioClientOptions as HioClientConfig };

const DEFAULT_BASE = "https://humanisoffline.com";

export class HioClient {
  readonly baseUrl: string;
  readonly fetchImpl: typeof fetch;

  constructor(options: HioClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? fetch;
  }

  async resolveCard(input: {
    type: "domain" | "github" | "url";
    identifier: string;
  }): Promise<ResolvedCard> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/cards/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    await assertOkResponse("resolveCard", response);
    return response.json() as Promise<ResolvedCard>;
  }

  async fetchCardMarkdown(url: string): Promise<string> {
    const response = await this.fetchImpl(url);
    await assertOkResponse("fetchCardMarkdown", response);
    return response.text();
  }

  async fetchCardJson(url: string): Promise<CardJson> {
    const response = await this.fetchImpl(url);
    await assertOkResponse("fetchCardJson", response);
    return response.json() as Promise<CardJson>;
  }

  async submitAskFirstNote(input: {
    cardSlug: string;
    envelope: EncryptedRequestEnvelope;
  }): Promise<AskFirstResult> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/api/cards/${encodeURIComponent(input.cardSlug)}/requests`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.envelope),
      },
    );
    await assertOkResponse("submitAskFirstNote", response);
    return response.json() as Promise<AskFirstResult>;
  }

  async submitAskFirstNotePlaintext(input: {
    cardJson: CardJson;
    plaintext: AskFirstPlaintext;
    interpretedBoundary?: InterpretedBoundary;
  }): Promise<AskFirstResult> {
    const envelope = buildAskFirstEnvelopeFromCard(
      input.cardJson,
      input.plaintext,
      input.interpretedBoundary,
    );
    return this.submitAskFirstNote({
      cardSlug: input.cardJson.card.slug,
      envelope,
    });
  }

  async getReceipt(receiptUrl: string): Promise<DelegationReceipt> {
    const response = await this.fetchImpl(receiptUrl);
    await assertOkResponse("getReceipt", response);
    return response.json() as Promise<DelegationReceipt>;
  }
}

export function createHioClient(options?: HioClientOptions): HioClient {
  return new HioClient(options);
}

export { buildAskFirstEnvelope, buildAskFirstEnvelopeFromCard };
export { sealBoxEncrypt } from "./crypto.js";
export { HioClientError } from "./errors.js";
export {
  HIO_PROTOCOL_VERSION,
  type AnchorStatus,
  type AskFirstPlaintext,
  type AskFirstResult,
  type BoundaryOutcome,
  type BuildAskFirstEnvelopeInput,
  type CardJson,
  type CardRequestPolicy,
  type DelegationReceipt,
  type EncryptedRequestEnvelope,
  type InterpretedBoundary,
  type RequestType,
  type ResolvedCard,
  type RiskLevel,
  type UrgencyLevel,
} from "./types.js";
