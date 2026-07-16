import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  sealBoxEncrypt,
} from "./crypto.js";
import {
  buildAskFirstEnvelope,
  buildAskFirstEnvelopeFromCard,
} from "./envelope.js";
import { HIO_PROTOCOL_VERSION } from "./types.js";

describe("sealBoxEncrypt", () => {
  it("produces ciphertext the card owner key can open", () => {
    const pair = nacl.box.keyPair();
    const publicKey = bytesToBase64Url(pair.publicKey);
    const plaintext = JSON.stringify({
      schemaVersion: HIO_PROTOCOL_VERSION,
      type: "inform",
      title: "Test",
      summary: "Agent note",
      urgency: "normal",
      riskLevel: "low",
    });

    const { encryptedPayload, nonce } = sealBoxEncrypt(publicKey, plaintext);
    const combinedBytes = base64UrlToBytes(encryptedPayload);
    const nonceBytes = base64UrlToBytes(nonce);
    const ephemeralPublicKey = combinedBytes.slice(0, nacl.box.publicKeyLength);
    const ciphertext = combinedBytes.slice(nacl.box.publicKeyLength);
    const opened = nacl.box.open(
      ciphertext,
      nonceBytes,
      ephemeralPublicKey,
      pair.secretKey,
    );

    expect(opened).not.toBeNull();
    expect(new TextDecoder().decode(opened!)).toBe(plaintext);
  });
});

describe("buildAskFirstEnvelope", () => {
  const pair = nacl.box.keyPair();
  const publicKey = bytesToBase64Url(pair.publicKey);

  const plaintext = {
    schemaVersion: HIO_PROTOCOL_VERSION,
    type: "inform" as const,
    title: "Need approval",
    summary: "Deploy staging",
    urgency: "normal" as const,
    riskLevel: "medium" as const,
  };

  it("builds a v3 sealed_box_v1 envelope", () => {
    const envelope = buildAskFirstEnvelope({
      cardSlug: "example",
      cardUpdatedAt: "2026-07-12T12:00:00.000Z",
      cardSchemaVersion: HIO_PROTOCOL_VERSION,
      publicEncryptionKey: publicKey,
      publicKeyId: "pk_test",
      plaintext,
      interpretedBoundary: {
        outcome: "ask_first",
        summary: "Deploy staging",
      },
    });

    expect(envelope.schemaVersion).toBe(3);
    expect(envelope.cardSlug).toBe("example");
    expect(envelope.encryption.scheme).toBe("sealed_box_v1");
    expect(envelope.encryptedPayload.length).toBeGreaterThan(0);
    expect(envelope.publicKeyId).toBe("pk_test");
    expect(envelope.interpretedBoundary?.outcome).toBe("ask_first");
  });

  it("builds from card JSON", () => {
    const envelope = buildAskFirstEnvelopeFromCard(
      {
        schemaVersion: HIO_PROTOCOL_VERSION,
        card: {
          slug: "example",
          updatedAt: "2026-07-12T12:00:00.000Z",
          requestPolicy: {
            acceptsRequests: true,
            endpoint: "https://humanisoffline.com/api/cards/example/requests",
            encryption: "required",
            publicKeyId: "pk_test",
            publicEncryptionKey: publicKey,
          },
        },
      },
      plaintext,
    );

    expect(envelope.cardSlug).toBe("example");
    expect(envelope.cardUpdatedAtSeen).toBe("2026-07-12T12:00:00.000Z");
  });

  it("rejects cards that do not accept requests", () => {
    expect(() =>
      buildAskFirstEnvelopeFromCard(
        {
          schemaVersion: HIO_PROTOCOL_VERSION,
          card: {
            slug: "example",
            updatedAt: "2026-07-12T12:00:00.000Z",
            requestPolicy: {
              acceptsRequests: false,
              endpoint: "https://humanisoffline.com/api/cards/example/requests",
              encryption: "required",
              publicKeyId: null,
              publicEncryptionKey: publicKey,
            },
          },
        },
        plaintext,
      ),
    ).toThrow("Card does not accept inbox requests");
  });

  it("rejects cards without a request encryption key", () => {
    expect(() =>
      buildAskFirstEnvelopeFromCard(
        {
          schemaVersion: HIO_PROTOCOL_VERSION,
          card: {
            slug: "example",
            updatedAt: "2026-07-12T12:00:00.000Z",
            requestPolicy: {
              acceptsRequests: true,
              endpoint: "https://humanisoffline.com/api/cards/example/requests",
              encryption: "required",
              publicKeyId: null,
              publicEncryptionKey: null,
            },
          },
        },
        plaintext,
      ),
    ).toThrow("Card does not have a request encryption key");
  });

  it("rejects plaintext with the wrong schema version", () => {
    expect(() =>
      buildAskFirstEnvelope({
        cardSlug: "example",
        cardUpdatedAt: "2026-07-12T12:00:00.000Z",
        cardSchemaVersion: HIO_PROTOCOL_VERSION,
        publicEncryptionKey: publicKey,
        publicKeyId: "pk_test",
        plaintext: {
          ...plaintext,
          schemaVersion: 2 as unknown as typeof HIO_PROTOCOL_VERSION,
        },
      }),
    ).toThrow(`Plaintext schemaVersion must be ${HIO_PROTOCOL_VERSION}`);
  });
});
