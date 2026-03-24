import { decrypt } from "../crypto";
import { LighterAdapter } from "./lighter-adapter";
import type { IExchangeService, ExchangeCredentials } from "./types";
import type { ExchangeAccount } from "../../drizzle/schema";

/**
 * Creates an exchange service adapter from a stored ExchangeAccount record.
 * Decrypts sensitive credentials in memory — they are never returned to the client.
 */
export function createExchangeService(account: ExchangeAccount): IExchangeService {
  switch (account.exchangeType) {
    case "lighter": {
      if (!account.encryptedPrivateKey) {
        throw new Error("Private key not configured for this account");
      }
      const credentials: ExchangeCredentials = {
        accountIndex: account.accountIndex || "1",
        apiKeyIndex: account.apiKeyIndex || "4",
        apiPrivateKey: decrypt(account.encryptedPrivateKey),
        l1Address: account.l1Address || undefined,
      };
      return new LighterAdapter(credentials);
    }
    default:
      throw new Error(`Unsupported exchange type: ${account.exchangeType}`);
  }
}
