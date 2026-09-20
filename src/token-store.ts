import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class EncryptedTokenStore {
  constructor(
    private readonly keyHex: string,
    private readonly path = "data/loyverse-tokens.enc",
  ) {}

  async load(): Promise<OAuthTokens | undefined> {
    try {
      const packed = Buffer.from(await readFile(this.path, "utf8"), "base64");
      const iv = packed.subarray(0, 12);
      const tag = packed.subarray(12, 28);
      const ciphertext = packed.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", Buffer.from(this.keyHex, "hex"), iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(plaintext.toString("utf8")) as OAuthTokens;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async save(tokens: OAuthTokens): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(this.keyHex, "hex"), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
    const packed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, packed, { encoding: "utf8", mode: 0o600 });
  }
}