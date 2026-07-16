# @humanisoffline/hio-client

Canonical Human Is Offline agent loop for npm and MCP.

Source repo for the public npm package. The hosted app lives in a separate private monorepo.

## Install

```bash
npm install @humanisoffline/hio-client
```

## API

```ts
import {
  createHioClient,
  buildAskFirstEnvelopeFromCard,
  HIO_PROTOCOL_VERSION,
} from "@humanisoffline/hio-client";

const hio = createHioClient({ baseUrl: "https://humanisoffline.com" });

const resolved = await hio.resolveCard({
  type: "github",
  identifier: "octocat",
});

const markdown = await hio.fetchCardMarkdown(resolved.cardMarkdown);
const cardJson = await hio.fetchCardJson(resolved.cardJson);

const result = await hio.submitAskFirstNotePlaintext({
  cardJson,
  plaintext: {
    schemaVersion: HIO_PROTOCOL_VERSION,
    type: "inform",
    title: "Need approval",
    summary: "Deploy staging after tests pass.",
    urgency: "normal",
    riskLevel: "medium",
  },
  interpretedBoundary: {
    outcome: "ask_first",
    summary: "Deploy staging",
  },
});

const receipt = await hio.getReceipt(result.receiptUrl);
```

### Lower-level envelope builder

If you already have card fields and the public encryption key:

```ts
import { buildAskFirstEnvelope } from "@humanisoffline/hio-client";

const envelope = buildAskFirstEnvelope({
  cardSlug: "example",
  cardUpdatedAt: "2026-07-12T12:00:00.000Z",
  cardSchemaVersion: 3,
  publicEncryptionKey: "…",
  publicKeyId: "pk_…",
  plaintext: { /* see agent-request.v3.json */ schemaVersion: 3, … },
});

await hio.submitAskFirstNote({ cardSlug: "example", envelope });
```

Encryption uses `sealed_box_v1` (NaCl box). Plaintext is never sent to the server.

## MCP server

```bash
HIO_BASE_URL=https://humanisoffline.com npx @humanisoffline/hio-client hio-mcp
```

One agent loop via tools:

1. `fetch_card_markdown` — read authority from `/c/{slug}.md`
2. `fetch_card_json` — structured fields and encryption keys
3. `submit_ask_first_note` — pass `cardJsonUrl` + `plaintext`; encrypts and posts one inbox note
4. `get_receipt` — fetch delegation receipt JSON

Optional: `resolve_card` when the human shared an alias instead of a card URL.

`submit_ask_first_note` is the only submit path. It fetches card JSON, builds the sealed envelope, and stops after one POST.

Discovery: read `/llms.txt` on the configured base URL for routes and schemas.

## Development

This repo uses a two-branch release model:

| Branch | Role |
|--------|------|
| `develop` | Integration — open PRs here |
| `main` | Release line — version bumps and npm tags only |

### Workflow

1. Branch from `develop`, make changes, open a PR into `develop`.
2. CI must pass (`ci` on Node 20 and 22, gitleaks, audit, build, tests).
3. To release: bump `version` in `package.json` on `develop`, open a PR into `main`, merge.
4. Tag the merge commit on `main`: `git tag v0.1.3 && git push origin v0.1.3`.

The `publish.yml` workflow builds, tests, verifies the tag matches `package.json`, and publishes to npm with provenance.

```bash
npm run verify
```

## Network access

This package makes outbound HTTPS requests to the configured Human Is Offline base URL (`https://humanisoffline.com` by default). It does not phone home elsewhere, collect telemetry, or run code at install time.
