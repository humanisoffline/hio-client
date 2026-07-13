import { sealBoxEncrypt } from "./crypto.js";
import {
  HIO_PROTOCOL_VERSION,
  type AskFirstPlaintext,
  type BuildAskFirstEnvelopeInput,
  type CardJson,
  type EncryptedRequestEnvelope,
  type InterpretedBoundary,
} from "./types.js";

export function buildAskFirstEnvelope(
  input: BuildAskFirstEnvelopeInput,
): EncryptedRequestEnvelope {
  if (!input.publicEncryptionKey) {
    throw new Error("Card does not have a request encryption key");
  }
  if (input.plaintext.schemaVersion !== HIO_PROTOCOL_VERSION) {
    throw new Error(`Plaintext schemaVersion must be ${HIO_PROTOCOL_VERSION}`);
  }

  const { encryptedPayload, nonce } = sealBoxEncrypt(
    input.publicEncryptionKey,
    JSON.stringify(input.plaintext),
  );

  const envelope: EncryptedRequestEnvelope = {
    schemaVersion: HIO_PROTOCOL_VERSION,
    cardSlug: input.cardSlug,
    cardUpdatedAtSeen: input.cardUpdatedAt,
    cardSchemaVersionSeen: input.cardSchemaVersion,
    encryptedPayload,
    encryption: { scheme: "sealed_box_v1", nonce },
  };

  if (input.publicKeyId) {
    envelope.publicKeyId = input.publicKeyId;
  }
  if (input.interpretedBoundary) {
    envelope.interpretedBoundary = input.interpretedBoundary;
  }

  return envelope;
}

export function buildAskFirstEnvelopeFromCard(
  cardJson: CardJson,
  plaintext: AskFirstPlaintext,
  interpretedBoundary?: InterpretedBoundary,
): EncryptedRequestEnvelope {
  const { requestPolicy } = cardJson.card;
  if (!requestPolicy.acceptsRequests) {
    throw new Error("Card does not accept inbox requests");
  }
  if (!requestPolicy.publicEncryptionKey) {
    throw new Error("Card does not have a request encryption key");
  }

  return buildAskFirstEnvelope({
    cardSlug: cardJson.card.slug,
    cardUpdatedAt: cardJson.card.updatedAt,
    cardSchemaVersion: cardJson.schemaVersion,
    publicEncryptionKey: requestPolicy.publicEncryptionKey,
    publicKeyId: requestPolicy.publicKeyId,
    plaintext,
    interpretedBoundary,
  });
}
