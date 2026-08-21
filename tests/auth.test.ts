import assert from "node:assert/strict";
import { createOAuthFlowValue, readOAuthFlowValue, safeReturnTo } from "../app/auth";

const secret = "test-secret-long-enough-for-hmac-signatures";
const flow = { state: "state-123", verifier: "verifier-456", returnTo: "/configuration?source=test", expiresAt: Date.now() + 60_000 };
const signed = await createOAuthFlowValue(flow, secret);

assert.deepEqual(await readOAuthFlowValue(signed, secret), flow);
assert.equal(await readOAuthFlowValue(`${signed.slice(0, -1)}x`, secret), null, "un cookie OAuth modifié doit être refusé");
assert.equal(await readOAuthFlowValue(signed, `${secret}-different`), null, "une autre clé ne doit pas valider la signature");
assert.equal(safeReturnTo("/configuration?source=test"), "/configuration?source=test");
assert.equal(safeReturnTo("https://example.com/vol"), "/");
assert.equal(safeReturnTo("//example.com/vol"), "/");
