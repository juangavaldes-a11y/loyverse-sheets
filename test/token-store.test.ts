import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EncryptedTokenStore } from "../src/token-store.js";

test("encrypted token store handles missing files and round trips without plaintext", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "loyverse-token-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "nested", "tokens.enc");
  const store = new EncryptedTokenStore("b".repeat(64), path);
  assert.equal(await store.load(), undefined);
  const tokens = { accessToken: "sensitive-access", refreshToken: "sensitive-refresh", expiresAt: 123 };
  await store.save(tokens);
  assert.deepEqual(await store.load(), tokens);
  assert.doesNotMatch(await readFile(path, "utf8"), /sensitive/);
});

test("encrypted token store rejects corruption and the wrong key", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "loyverse-token-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "tokens.enc");
  await writeFile(path, "not-valid-ciphertext");
  await assert.rejects(new EncryptedTokenStore("c".repeat(64), path).load());

  const valid = new EncryptedTokenStore("d".repeat(64), path);
  await valid.save({ accessToken: "a", refreshToken: "r", expiresAt: 1 });
  await assert.rejects(new EncryptedTokenStore("e".repeat(64), path).load());
});