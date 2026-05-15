/**
 * RSA keypair for OAuth 2.0 token signing (RS256).
 * On first use, generates a 2048-bit RSA keypair in memory.
 * In production, set OAUTH_PRIVATE_KEY and OAUTH_PUBLIC_KEY env vars
 * with PEM-encoded keys to persist across restarts.
 */
import crypto from "crypto";
import { env } from "@/config/env";
import logger from "@/utils/base.logger";

interface RsaKeyPair {
  privateKey: string;
  publicKey: string;
  kid: string;
}

let _keypair: RsaKeyPair | null = null;

export function getOAuthKeyPair(): RsaKeyPair {
  if (_keypair) return _keypair;

  // Prefer env-provided keys (stable across restarts)
  if (env.OAUTH_PRIVATE_KEY && env.OAUTH_PUBLIC_KEY) {
    _keypair = {
      privateKey: env.OAUTH_PRIVATE_KEY.replace(/\\n/g, "\n"),
      publicKey: env.OAUTH_PUBLIC_KEY.replace(/\\n/g, "\n"),
      kid: env.OAUTH_KEY_ID ?? "authy-rs256-1",
    };
    return _keypair;
  }

  // Generate ephemeral keypair (rotates on restart — acceptable for dev)
  logger.warn("No OAUTH_PRIVATE_KEY configured — generating ephemeral RSA keypair. Tokens will be invalidated on restart.");
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  _keypair = { privateKey, publicKey, kid: "authy-rs256-ephemeral" };
  return _keypair;
}

/**
 * Returns the JWK representation of the public key for /.well-known/jwks.json
 */
export function getPublicJwk(): Record<string, string> {
  const { publicKey, kid } = getOAuthKeyPair();
  const keyObj = crypto.createPublicKey(publicKey);
  const jwk = keyObj.export({ format: "jwk" }) as Record<string, string>;
  return { ...jwk, use: "sig", alg: "RS256", kid };
}
