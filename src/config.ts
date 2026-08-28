export interface AppConfig {
  mcpServerUrl: URL;
  resourceMetadataUrl: URL;
  supabaseUrl: URL;
  supabasePublishableKey: string;
  supabaseIssuer: string;
  supabaseJwksUrl: URL;
  supabaseAuthorizationServer: string;
}

let cachedConfig: AppConfig | undefined;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const mcpServerUrl = new URL(required("MCP_SERVER_URL"));
  const supabaseUrl = new URL(required("SUPABASE_URL"));
  const supabaseBase = supabaseUrl.toString().replace(/\/$/, "");

  if (mcpServerUrl.protocol !== "https:" && mcpServerUrl.hostname !== "localhost") {
    throw new Error("MCP_SERVER_URL must use HTTPS outside local development");
  }

  cachedConfig = {
    mcpServerUrl,
    resourceMetadataUrl: new URL("/.well-known/oauth-protected-resource", mcpServerUrl),
    supabaseUrl,
    supabasePublishableKey: required("SUPABASE_PUBLISHABLE_KEY"),
    supabaseIssuer: `${supabaseBase}/auth/v1`,
    supabaseJwksUrl: new URL(`${supabaseBase}/auth/v1/.well-known/jwks.json`),
    supabaseAuthorizationServer: `${supabaseBase}/auth/v1`,
  };
  return cachedConfig;
}

export function resetConfigForTests(): void {
  cachedConfig = undefined;
}
