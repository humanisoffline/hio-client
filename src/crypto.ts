import nacl from "tweetnacl";

const BASE64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function bytesToBase64Url(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;
    result += BASE64URL[(triple >> 18) & 63]!;
    result += BASE64URL[(triple >> 12) & 63]!;
    result += i + 1 < bytes.length ? BASE64URL[(triple >> 6) & 63]! : "";
    result += i + 2 < bytes.length ? BASE64URL[triple & 63]! : "";
  }
  return result;
}

export function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLen);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function sealBoxEncrypt(
  publicKeyBase64Url: string,
  plaintext: string,
): { encryptedPayload: string; nonce: string } {
  const publicKey = base64UrlToBytes(publicKeyBase64Url);
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const message = new TextEncoder().encode(plaintext);
  const encrypted = nacl.box(message, nonce, publicKey, ephemeral.secretKey);
  const combined = new Uint8Array(
    ephemeral.publicKey.length + encrypted.length,
  );
  combined.set(ephemeral.publicKey);
  combined.set(encrypted, ephemeral.publicKey.length);
  return {
    encryptedPayload: bytesToBase64Url(combined),
    nonce: bytesToBase64Url(nonce),
  };
}
