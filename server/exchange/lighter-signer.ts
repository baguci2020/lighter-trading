/**
 * Lighter Signer - Node.js bindings for the Lighter signer shared library
 * Uses ffi-napi to call the Go-compiled shared library for cryptographic signing
 */

import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Lazy-load ffi-napi to avoid issues in environments where it's not available
let _lib: LighterSignerLib | null = null;

interface StrOrErr {
  str: string | null;
  err: string | null;
}

interface SignedTxResponse {
  txType: number;
  txInfo: string | null;
  txHash: string | null;
  messageToSign: string | null;
  err: string | null;
}

interface LighterSignerLib {
  CreateClient: (url: string, privateKey: string, chainId: number, apiKeyIndex: number, accountIndex: number) => Buffer;
  CreateAuthToken: (deadline: number, apiKeyIndex: number, accountIndex: number) => StrOrErr;
  SignCreateOrder: (
    marketIndex: number,
    clientOrderIndex: number,
    baseAmount: number,
    price: number,
    isAsk: number,
    orderType: number,
    timeInForce: number,
    reduceOnly: number,
    triggerPrice: number,
    orderExpiry: number,
    integratorAccountIndex: number,
    integratorMakerFee: number,
    integratorTakerFee: number,
    apiKeyIndex: number,
    accountIndex: number,
    nonce: number,
  ) => SignedTxResponse;
  SignCancelOrder: (
    marketIndex: number,
    orderIndex: number,
    nonce: number,
    apiKeyIndex: number,
    accountIndex: number,
  ) => SignedTxResponse;
}

function getLib(): LighterSignerLib {
  if (_lib) return _lib;

  const ffi = require("ffi-napi");
  const ref = require("ref-napi");
  const Struct = require("ref-struct-di")(ref);

  const StrOrErr = Struct({ str: ref.types.CString, err: ref.types.CString });
  const SignedTxResponse = Struct({
    txType: ref.types.uint8,
    txInfo: ref.types.CString,
    txHash: ref.types.CString,
    messageToSign: ref.types.CString,
    err: ref.types.CString,
  });

  const libPath = path.join(__dirname, "../signers/lighter-signer-linux-amd64.so");

  _lib = ffi.Library(libPath, {
    // CreateClient(url, privateKey, chainId, apiKeyIndex, accountIndex) -> void* (error ptr, null = success)
    CreateClient: ["pointer", ["string", "string", "int", "int", "int64"]],
    // CreateAuthToken(deadline, apiKeyIndex, accountIndex) -> StrOrErr
    CreateAuthToken: [StrOrErr, ["int64", "int", "int64"]],
    // SignCreateOrder(...) -> SignedTxResponse
    SignCreateOrder: [
      SignedTxResponse,
      [
        "int16", // marketIndex
        "int64", // clientOrderIndex
        "int64", // baseAmount
        "uint32", // price
        "uint8", // isAsk
        "uint8", // orderType
        "uint8", // timeInForce
        "uint8", // reduceOnly
        "uint32", // triggerPrice
        "int64", // orderExpiry
        "int64", // integratorAccountIndex
        "int64", // integratorMakerFee
        "int64", // integratorTakerFee
        "int", // apiKeyIndex
        "int64", // accountIndex
        "int64", // nonce
      ],
    ],
    // SignCancelOrder(marketIndex, orderIndex, nonce, apiKeyIndex, accountIndex) -> SignedTxResponse
    SignCancelOrder: [
      SignedTxResponse,
      ["int16", "int64", "int64", "int", "int64"],
    ],
  }) as LighterSignerLib;

  return _lib;
}

export interface LighterSignerConfig {
  apiUrl: string;
  privateKey: string; // hex string without 0x prefix, 80 chars (40 bytes)
  apiKeyIndex: number;
  accountIndex: number;
  chainId?: number; // 304 for mainnet, 300 for testnet
}

export class LighterSigner {
  private config: LighterSignerConfig;
  private initialized = false;

  constructor(config: LighterSignerConfig) {
    // Strip 0x prefix if present
    this.config = {
      ...config,
      privateKey: config.privateKey.startsWith("0x")
        ? config.privateKey.slice(2)
        : config.privateKey,
      chainId: config.chainId ?? (config.apiUrl.includes("mainnet") || config.apiUrl.includes("api.") ? 304 : 300),
    };
  }

  private ensureInitialized(): void {
    if (this.initialized) return;

    const lib = getLib();
    const { apiUrl, privateKey, chainId, apiKeyIndex, accountIndex } = this.config;

    const errPtr = lib.CreateClient(
      apiUrl,
      privateKey,
      chainId!,
      apiKeyIndex,
      accountIndex
    );

    // errPtr is null on success; non-null means error string
    if (errPtr && (errPtr as unknown as { address: number }).address !== 0) {
      // Try to read error string - if readCString throws, it's a null ptr (success)
      try {
        const ref = require("ref-napi");
        const errStr = ref.readCString(errPtr as Buffer);
        if (errStr && !errStr.includes("already created")) {
          throw new Error(`Lighter signer init failed: ${errStr}`);
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("Lighter signer init failed")) {
          throw e;
        }
        // readCString threw "Cannot read from nullptr" = null ptr = success, ignore
      }
    }

    this.initialized = true;
  }

  createAuthToken(expirySeconds: number = 3600): string {
    this.ensureInitialized();
    const lib = getLib();
    const deadline = Math.floor(Date.now() / 1000) + expirySeconds;
    const result = lib.CreateAuthToken(deadline, this.config.apiKeyIndex, this.config.accountIndex);

    if (result.err) {
      throw new Error(`Failed to create auth token: ${result.err}`);
    }
    if (!result.str) {
      throw new Error("Auth token is empty");
    }
    return result.str;
  }

  signCreateOrder(params: {
    marketIndex: number;
    clientOrderIndex: number;
    baseAmount: number;
    price: number;
    isAsk: boolean;
    orderType: number;
    timeInForce: number;
    reduceOnly: boolean;
    triggerPrice: number;
    orderExpiry: number;
    nonce: number;
  }): { txType: number; txInfo: string; txHash: string } {
    this.ensureInitialized();
    const lib = getLib();

    const result = lib.SignCreateOrder(
      params.marketIndex,
      params.clientOrderIndex,
      params.baseAmount,
      params.price,
      params.isAsk ? 1 : 0,
      params.orderType,
      params.timeInForce,
      params.reduceOnly ? 1 : 0,
      params.triggerPrice,
      params.orderExpiry,
      0, // integratorAccountIndex
      0, // integratorMakerFee
      0, // integratorTakerFee
      this.config.apiKeyIndex,
      this.config.accountIndex,
      params.nonce,
    );

    if (result.err) {
      throw new Error(`Failed to sign create order: ${result.err}`);
    }

    return {
      txType: result.txType,
      txInfo: result.txInfo!,
      txHash: result.txHash!,
    };
  }

  signCancelOrder(params: {
    marketIndex: number;
    orderIndex: number;
    nonce: number;
  }): { txType: number; txInfo: string; txHash: string } {
    this.ensureInitialized();
    const lib = getLib();

    const result = lib.SignCancelOrder(
      params.marketIndex,
      params.orderIndex,
      params.nonce,
      this.config.apiKeyIndex,
      this.config.accountIndex,
    );

    if (result.err) {
      throw new Error(`Failed to sign cancel order: ${result.err}`);
    }

    return {
      txType: result.txType,
      txInfo: result.txInfo!,
      txHash: result.txHash!,
    };
  }
}
