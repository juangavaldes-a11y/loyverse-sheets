import { randomBytes } from "node:crypto";
import type { Config } from "./config.js";
import { fetchWithTimeout } from "./security.js";
import { EncryptedTokenStore, type OAuthTokens } from "./token-store.js";

const AUTHORIZE_URL = "https://api.loyverse.com/oauth/authorize";
const TOKEN_URL = "https://api.loyverse.com/oauth/token";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface TokenRepository {
  load(): Promise<OAuthTokens | undefined>;
  save(tokens: OAuthTokens): Promise<void>;
}

type HttpRequest = (url: string, init?: RequestInit) => Promise<Response>;

export class LoyverseAuth {
  private readonly store?: TokenRepository;
  private tokens?: OAuthTokens;
  private readonly states = new Map<string, number>();

  constructor(
    private readonly config: Config,
    store?: TokenRepository,
    private readonly httpRequest: HttpRequest = fetchWithTimeout,
  ) {
    if (config.LOYVERSE_AUTH_MODE === "oauth") this.store = store ?? new EncryptedTokenStore(config.TOKEN_ENCRYPTION_KEY!);
  }

  get redirectUri(): string {
    return `${this.config.PUBLIC_BASE_URL.replace(/\/$/, "")}/auth/loyverse/callback`;
  }

  createAuthorizationUrl(): string {
    if (this.config.LOYVERSE_AUTH_MODE !== "oauth") throw new Error("OAuth mode is not enabled");
    const now = Date.now();
    for (const [state, expiry] of this.states) {
      if (expiry < now) this.states.delete(state);
    }
    if (this.states.size >= 100) throw new Error("Too many pending OAuth requests");
    const state = randomBytes(32).toString("hex");
    this.states.set(state, now + 10 * 60_000);
    const query = new URLSearchParams({
      client_id: this.config.LOYVERSE_CLIENT_ID!,
      scope: this.config.LOYVERSE_SCOPES,
      response_type: "code",
      redirect_uri: this.redirectUri,
      state,
    });
    return `${AUTHORIZE_URL}?${query.toString()}`;
  }

  async exchangeCode(code: string, state: string): Promise<void> {
    const expiry = this.states.get(state);
    this.states.delete(state);
    if (!expiry || expiry < Date.now()) throw new Error("Invalid or expired OAuth state");
    const response = await this.requestToken({
      client_id: this.config.LOYVERSE_CLIENT_ID!,
      client_secret: this.config.LOYVERSE_CLIENT_SECRET!,
      redirect_uri: this.redirectUri,
      code,
      grant_type: "authorization_code",
    });
    if (!response.refresh_token) throw new Error("Loyverse did not return a refresh token");
    await this.setTokens(response, response.refresh_token);
  }

  async getAccessToken(): Promise<string> {
    if (this.config.LOYVERSE_AUTH_MODE === "personal") return this.config.LOYVERSE_ACCESS_TOKEN!;
    this.tokens ??= await this.store!.load();
    if (!this.tokens) throw new Error("Loyverse OAuth is not connected. Open /auth/loyverse first.");
    if (this.tokens.expiresAt > Date.now() + 60_000) return this.tokens.accessToken;
    const response = await this.requestToken({
      client_id: this.config.LOYVERSE_CLIENT_ID!,
      client_secret: this.config.LOYVERSE_CLIENT_SECRET!,
      refresh_token: this.tokens.refreshToken,
      grant_type: "refresh_token",
    });
    await this.setTokens(response, response.refresh_token ?? this.tokens.refreshToken);
    return this.tokens!.accessToken;
  }

  private async requestToken(fields: Record<string, string>): Promise<TokenResponse> {
    const response = await this.httpRequest(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });
    if (!response.ok) throw new Error(`Loyverse token request failed (${response.status})`);
    return response.json() as Promise<TokenResponse>;
  }

  private async setTokens(response: TokenResponse, refreshToken: string): Promise<void> {
    this.tokens = {
      accessToken: response.access_token,
      refreshToken,
      expiresAt: Date.now() + response.expires_in * 1000,
    };
    await this.store!.save(this.tokens);
  }
}