import type { AuthInfo, OAuthTokenVerifier } from "@modelcontextprotocol/server";
import { OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { getConfig } from "../config.js";

export interface SupabaseAccessClaims extends JWTPayload {
  client_id: string;
  role?: string;
}

function invalidToken(): OAuthError {
  return new OAuthError(OAuthErrorCode.InvalidToken, "The access token is invalid or expired");
}

export class SupabaseOAuthTokenVerifier implements OAuthTokenVerifier {
  private readonly jwks = createRemoteJWKSet(getConfig().supabaseJwksUrl);

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      const config = getConfig();
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: config.supabaseIssuer,
        audience: "authenticated",
        algorithms: ["ES256", "RS256"],
      });
      const claims = payload as SupabaseAccessClaims;

      if (!claims.sub || !claims.exp || !claims.client_id || claims.role !== "authenticated") {
        throw invalidToken();
      }

      return {
        token,
        clientId: claims.client_id,
        scopes: ["openid", "email", "profile"],
        expiresAt: claims.exp,
        resource: config.mcpServerUrl,
        extra: { userId: claims.sub },
      };
    } catch (error) {
      if (error instanceof OAuthError) throw error;
      throw invalidToken();
    }
  }
}
