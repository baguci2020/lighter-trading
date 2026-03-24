import axios from "axios";
import type {
  IExchangeService,
  ExchangeCredentials,
  AccountBalance,
  Position,
  MarketInfo,
  OrderBook,
  Order,
  Trade,
  CreateOrderParams,
  CancelOrderParams,
  GetOrdersParams,
  GetTradesParams,
} from "./types";
import { LighterSigner } from "./lighter-signer";

const LIGHTER_BASE_URL = "https://mainnet.zklighter.elliot.ai";

// Lighter order type constants
const ORDER_TYPE_LIMIT = 0;
const ORDER_TYPE_MARKET = 1;
const ORDER_TYPE_STOP_LOSS = 2;
const ORDER_TYPE_TAKE_PROFIT = 3;
const ORDER_TYPE_STOP_LOSS_LIMIT = 4;
const ORDER_TYPE_TAKE_PROFIT_LIMIT = 5;

const TIME_IN_FORCE_GTT = 0;
const TIME_IN_FORCE_IOC = 1;

// Lighter order status mapping (numeric codes)
const STATUS_MAP: Record<number, string> = {
  0: "pending",
  1: "pending",
  2: "active",
  3: "filled",
  4: "cancelled",
  5: "cancelled",
  6: "cancelled",
  7: "cancelled",
  8: "cancelled",
  9: "cancelled",
  10: "cancelled",
  11: "cancelled",
  12: "expired",
  13: "cancelled",
  14: "cancelled",
  15: "cancelled",
  16: "cancelled",
};

// Lighter order status string mapping (API returns string status)
const STATUS_STRING_MAP: Record<string, string> = {
  "pending": "pending",
  "open": "active",
  "active": "active",
  "filled": "filled",
  "partially_filled": "active",
  "cancelled": "cancelled",
  "canceled": "cancelled",
  "expired": "expired",
  "rejected": "cancelled",
  "triggered": "active",
};

// Lighter order type string mapping (API returns string type)
const ORDER_TYPE_STRING_MAP: Record<string, string> = {
  "limit": "limit",
  "market": "market",
  "stop_loss": "stop_loss",
  "stop-loss": "stop_loss",
  "take_profit": "take_profit",
  "take-profit": "take_profit",
  "stop_loss_limit": "stop_loss_limit",
  "take_profit_limit": "take_profit_limit",
};

function lighterOrderTypeToInternal(ot: number): string {
  switch (ot) {
    case ORDER_TYPE_LIMIT: return "limit";
    case ORDER_TYPE_MARKET: return "market";
    case ORDER_TYPE_STOP_LOSS: return "stop_loss";
    case ORDER_TYPE_TAKE_PROFIT: return "take_profit";
    case ORDER_TYPE_STOP_LOSS_LIMIT: return "stop_loss_limit";
    case ORDER_TYPE_TAKE_PROFIT_LIMIT: return "take_profit_limit";
    default: return "limit";
  }
}

function internalOrderTypeToLighter(orderType: string): number {
  switch (orderType) {
    case "market": return ORDER_TYPE_MARKET;
    case "limit": return ORDER_TYPE_LIMIT;
    case "stop_loss": return ORDER_TYPE_STOP_LOSS;
    case "take_profit": return ORDER_TYPE_TAKE_PROFIT;
    case "stop_loss_limit": return ORDER_TYPE_STOP_LOSS_LIMIT;
    case "take_profit_limit": return ORDER_TYPE_TAKE_PROFIT_LIMIT;
    default: return ORDER_TYPE_LIMIT;
  }
}

// Convert decimal price string to Lighter integer format
function priceToLighter(price: string, pricePrecision: number): number {
  return Math.round(parseFloat(price) * Math.pow(10, pricePrecision));
}

// Convert Lighter integer price to decimal string
function priceFromLighter(price: number, pricePrecision: number): string {
  return (price / Math.pow(10, pricePrecision)).toFixed(pricePrecision);
}

// Convert decimal size to Lighter integer format
function sizeToLighter(size: string, sizePrecision: number): number {
  return Math.round(parseFloat(size) * Math.pow(10, sizePrecision));
}

function sizeFromLighter(size: number, sizePrecision: number): string {
  return (Math.abs(size) / Math.pow(10, sizePrecision)).toFixed(sizePrecision);
}

export class LighterAdapter implements IExchangeService {
  exchangeType = "lighter";
  private credentials: ExchangeCredentials;
  private signer: LighterSigner | null = null;
  private signerInitError: string | null = null;
  private authToken: string | null = null;
  private authTokenExpiry: number = 0;
  // Cache market info to avoid repeated calls
  private marketsCache: MarketInfo[] | null = null;
  private marketsCacheTime: number = 0;
  private readonly MARKETS_CACHE_TTL = 60_000; // 1 minute

  constructor(credentials: ExchangeCredentials) {
    this.credentials = credentials;
    // Initialize signer lazily - only if private key is available
    if (credentials.apiPrivateKey) {
      try {
        this.signer = new LighterSigner({
          apiUrl: LIGHTER_BASE_URL,
          privateKey: credentials.apiPrivateKey,
          apiKeyIndex: parseInt(credentials.apiKeyIndex || "4"),
          accountIndex: parseInt(credentials.accountIndex || "0"),
        });
      } catch (e) {
        this.signerInitError = e instanceof Error ? e.message : String(e);
        console.warn("[LighterAdapter] Signer init failed:", this.signerInitError);
      }
    }
  }

  private get api() {
    return axios.create({
      baseURL: LIGHTER_BASE_URL,
      timeout: 15000,
      headers: { accept: "application/json" },
    });
  }

  private getAuthToken(): string {
    const now = Date.now();
    // Reuse cached token if still valid (with 2 min buffer)
    if (this.authToken && now < this.authTokenExpiry - 120_000) {
      return this.authToken;
    }

    if (!this.signer) {
      throw new Error(
        this.signerInitError
          ? `Signer initialization failed: ${this.signerInitError}`
          : "No private key configured. Please add your Lighter API private key in exchange settings."
      );
    }

    // Create auth token valid for 8 hours (Lighter max)
    const token = this.signer.createAuthToken(8 * 3600);
    this.authToken = token;
    // Parse expiry from token: format is {expiry_unix}:{account}:{key}:{hex}
    const expiryUnix = parseInt(token.split(":")[0]);
    this.authTokenExpiry = expiryUnix * 1000;
    return token;
  }

  private async authenticatedGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const token = this.getAuthToken();
    const response = await this.api.get<T>(path, {
      params,
      headers: { authorization: token },
    });
    return response.data;
  }

  async getMarkets(): Promise<MarketInfo[]> {
    const now = Date.now();
    if (this.marketsCache && now - this.marketsCacheTime < this.MARKETS_CACHE_TTL) {
      return this.marketsCache;
    }

    try {
      const data = await this.api.get("/api/v1/orderBooks");
      const orderBooks = data.data?.order_books || [];

      const markets: MarketInfo[] = orderBooks.map((ob: Record<string, unknown>) => ({
        marketId: ob.market_id as number,
        symbol: (ob.symbol as string) || `MARKET-${ob.market_id}`,
        baseAsset: (ob.base_asset as string) || "UNKNOWN",
        quoteAsset: (ob.quote_asset as string) || "USDC",
        pricePrecision: (ob.supported_price_decimals as number) || 2,
        sizePrecision: (ob.supported_size_decimals as number) || 3,
        minOrderSize: (ob.min_base_amount as string) || "0.001",
        maxLeverage: 20,
      }));

      this.marketsCache = markets;
      this.marketsCacheTime = now;
      return markets;
    } catch {
      return this.getFallbackMarkets();
    }
  }

  private getFallbackMarkets(): MarketInfo[] {
    return [
      { marketId: 0, symbol: "ETH-PERP", baseAsset: "ETH", quoteAsset: "USDC", pricePrecision: 2, sizePrecision: 3, minOrderSize: "0.001", maxLeverage: 20 },
      { marketId: 1, symbol: "BTC-PERP", baseAsset: "BTC", quoteAsset: "USDC", pricePrecision: 1, sizePrecision: 5, minOrderSize: "0.00001", maxLeverage: 20 },
      { marketId: 2, symbol: "SOL-PERP", baseAsset: "SOL", quoteAsset: "USDC", pricePrecision: 3, sizePrecision: 2, minOrderSize: "0.01", maxLeverage: 20 },
    ];
  }

  async getBalance(): Promise<AccountBalance> {
    const { accountIndex } = this.credentials;
    const data = await this.authenticatedGet<Record<string, unknown>>(
      "/api/v1/account",
      { by: "index", value: accountIndex }
    );

    const accounts = ((data as Record<string, unknown>).accounts as Record<string, unknown>[]) || [];
    const acc = accounts[0] || {};

    const collateral = parseFloat((acc.collateral as string) || "0");
    const availableBalance = parseFloat((acc.available_balance as string) || "0");
    const positions = (acc.positions as Record<string, unknown>[]) || [];

    let totalUnrealizedPnl = 0;
    let usedMargin = 0;

    for (const pos of positions) {
      totalUnrealizedPnl += parseFloat((pos.unrealized_pnl as string) || "0");
      usedMargin += parseFloat((pos.position_value as string) || "0");
    }

    const totalValue = collateral + totalUnrealizedPnl;

    return {
      totalValue: totalValue.toFixed(2),
      availableBalance: availableBalance.toFixed(2),
      usedMargin: usedMargin.toFixed(2),
      unrealizedPnl: totalUnrealizedPnl.toFixed(2),
      collateral: collateral.toFixed(2),
    };
  }

  async getPositions(): Promise<Position[]> {
    const { accountIndex } = this.credentials;
    const markets = await this.getMarkets();
    const marketMap = new Map(markets.map(m => [m.marketId, m]));

    const data = await this.authenticatedGet<Record<string, unknown>>(
      "/api/v1/account",
      { by: "index", value: accountIndex }
    );

    const accounts = ((data as Record<string, unknown>).accounts as Record<string, unknown>[]) || [];
    const acc = accounts[0] || {};
    const positions = (acc.positions as Record<string, unknown>[]) || [];

    return positions
      .filter(pos => parseFloat((pos.position as string) || "0") !== 0)
      .map(pos => {
        const marketId = pos.market_id as number;
        const market = marketMap.get(marketId);
        const sign = (pos.sign as number) || 1;
        const positionSize = parseFloat((pos.position as string) || "0");

        return {
          marketId,
          marketSymbol: market?.symbol || `MARKET-${marketId}`,
          side: sign === 1 ? "long" : "short",
          size: String(Math.abs(positionSize)),
          entryPrice: String(pos.avg_entry_price || "0"),
          markPrice: String(pos.mark_price || "0"),
          positionValue: (pos.position_value as string) || "0",
          unrealizedPnl: (pos.unrealized_pnl as string) || "0",
          realizedPnl: (pos.realized_pnl as string) || "0",
          leverage: (pos.leverage as number) || 1,
          openOrderCount: (pos.ooc as number) || 0,
        } as Position;
      });
  }

  async getOrderBook(marketId: number): Promise<OrderBook> {
    const markets = await this.getMarkets();
    const market = markets.find(m => m.marketId === marketId);

    const data = await this.api.get("/api/v1/orderBookOrders", {
      params: { market_id: marketId, limit: 20 },
    });

    // Lighter API returns price and size as decimal strings directly
    const asks = ((data.data?.asks || []) as Record<string, unknown>[]).map(a => ({
      price: String(a.price || "0"),
      size: String(a.remaining_base_amount || a.base_amount || "0"),
    }));

    const bids = ((data.data?.bids || []) as Record<string, unknown>[]).map(b => ({
      price: String(b.price || "0"),
      size: String(b.remaining_base_amount || b.base_amount || "0"),
    }));

    return {
      marketSymbol: market?.symbol || `MARKET-${marketId}`,
      bids,
      asks,
      timestamp: Date.now(),
    };
  }

  private async getNonce(): Promise<number> {
    const { accountIndex, apiKeyIndex } = this.credentials;
    try {
      const data = await this.authenticatedGet<Record<string, unknown>>(
        "/api/v1/apiKeyNonce",
        { account_index: accountIndex, api_key_index: apiKeyIndex || "4" }
      );
      return (data as Record<string, unknown>).nonce as number || 0;
    } catch {
      return 0;
    }
  }

  async createOrder(params: CreateOrderParams): Promise<Order> {
    const markets = await this.getMarkets();
    const market = markets.find(m => m.marketId === params.marketId);
    if (!market) throw new Error(`Market ${params.marketId} not found`);

    if (!this.signer) {
      throw new Error("No signer available. Please configure your Lighter API private key.");
    }

    const isAsk = params.side === "sell";
    const orderType = internalOrderTypeToLighter(params.orderType);
    const baseAmount = sizeToLighter(params.size, market.sizePrecision);
    const price = params.price
      ? priceToLighter(params.price, market.pricePrecision)
      : 0;
    const triggerPrice = params.triggerPrice
      ? priceToLighter(params.triggerPrice, market.pricePrecision)
      : 0;

    const isMarket = params.orderType === "market";
    const timeInForce = isMarket ? TIME_IN_FORCE_IOC : TIME_IN_FORCE_GTT;
    const clientOrderId = params.clientOrderId || Math.floor(Math.random() * 1_000_000);
    const orderExpiry = params.expiry || (isMarket
      ? Math.floor(Date.now() / 1000) + 60
      : Math.floor(Date.now() / 1000) + 2592000);

    // Get current nonce
    const nonce = await this.getNonce();

    // Sign the order using the signer library
    const { txType, txInfo } = this.signer.signCreateOrder({
      marketIndex: params.marketId,
      clientOrderIndex: clientOrderId,
      baseAmount,
      price,
      isAsk,
      orderType,
      timeInForce,
      reduceOnly: params.reduceOnly || false,
      triggerPrice,
      orderExpiry,
      nonce,
    });

    // Submit the signed transaction
    const response = await this.api.post("/api/v1/transaction", {
      tx_type: txType,
      tx_info: txInfo,
    });

    const order = response.data;
    return this.mapLighterOrder(order, market);
  }

  async cancelOrder(params: CancelOrderParams): Promise<boolean> {
    if (!this.signer) {
      throw new Error("No signer available. Please configure your Lighter API private key.");
    }

    const nonce = await this.getNonce();

    const { txType, txInfo } = this.signer.signCancelOrder({
      marketIndex: params.marketId,
      orderIndex: parseInt(params.orderId),
      nonce,
    });

    await this.api.post("/api/v1/transaction", {
      tx_type: txType,
      tx_info: txInfo,
    });

    return true;
  }

  async cancelAllOrders(marketId?: number): Promise<number> {
    const activeOrders = await this.getActiveOrders({ marketId });
    let cancelled = 0;
    for (const order of activeOrders) {
      try {
        await this.cancelOrder({ marketId: order.marketId, orderId: order.orderId });
        cancelled++;
      } catch {
        // Continue cancelling remaining orders
      }
    }
    return cancelled;
  }

  async getActiveOrders(params?: GetOrdersParams): Promise<Order[]> {
    const { accountIndex } = this.credentials;
    const markets = await this.getMarkets();
    const marketMap = new Map(markets.map(m => [m.marketId, m]));

    const queryParams: Record<string, unknown> = {
      account_index: accountIndex,
      limit: params?.limit || 50,
    };
    if (params?.marketId !== undefined) queryParams.market_id = params.marketId;

    const token = this.getAuthToken();
    const data = await this.api.get("/api/v1/accountActiveOrders", {
      params: queryParams,
      headers: { authorization: token },
    });

    const orders = (data.data?.orders || []) as Record<string, unknown>[];
    return orders.map(o => {
      const market = marketMap.get(o.market_id as number);
      return this.mapLighterOrder(o, market);
    });
  }

  async getOrderHistory(params?: GetOrdersParams): Promise<Order[]> {
    const { accountIndex } = this.credentials;
    const markets = await this.getMarkets();
    const marketMap = new Map(markets.map(m => [m.marketId, m]));

    const queryParams: Record<string, unknown> = {
      account_index: accountIndex,
      limit: params?.limit || 50,
    };
    if (params?.marketId !== undefined) queryParams.market_id = params.marketId;
    if (params?.cursor) queryParams.cursor = params.cursor;

    const token = this.getAuthToken();
    const data = await this.api.get("/api/v1/accountInactiveOrders", {
      params: queryParams,
      headers: { authorization: token },
    });

    const orders = (data.data?.orders || []) as Record<string, unknown>[];
    return orders.map(o => {
      const mid = (o.market_index as number) ?? (o.market_id as number);
      const market = marketMap.get(mid);
      return this.mapLighterOrder(o, market);
    });
  }

  async getTradeHistory(params?: GetTradesParams): Promise<Trade[]> {
    const { accountIndex } = this.credentials;
    const markets = await this.getMarkets();
    const marketMap = new Map(markets.map(m => [m.marketId, m]));

    const queryParams: Record<string, unknown> = {
      account_index: accountIndex,
      sort_by: "timestamp",
      sort_dir: "desc",
      limit: params?.limit || 50,
    };
    if (params?.marketId !== undefined) queryParams.market_id = params.marketId;
    if (params?.cursor) queryParams.cursor = params.cursor;

    const token = this.getAuthToken();
    const data = await this.api.get("/api/v1/trades", {
      params: queryParams,
      headers: { authorization: token },
    });

    const trades = (data.data?.trades || []) as Record<string, unknown>[];
    return trades.map(t => {
      const marketId = t.market_id as number;
      const market = marketMap.get(marketId);
      const isAsk = (t.is_ask as number) === 1;
      const fee = parseFloat((t.taker_fee as string) || (t.maker_fee as string) || "0");
      const role = t.role === "maker" ? "maker" : "taker";

      const price = parseFloat(String(t.price || "0"));
      const size = Math.abs(parseFloat(String(t.size || t.base_amount || "0")));
      const quoteAmount = (price * size).toFixed(6);
      // realizedPnl from API if available
      const realizedPnl = t.realized_pnl != null ? String(t.realized_pnl) : undefined;

      return {
        tradeId: String(t.trade_id || t.id || ""),
        orderId: String(t.order_index || ""),
        marketId,
        marketSymbol: market?.symbol || `MARKET-${marketId}`,
        side: isAsk ? "sell" : "buy",
        price: String(t.price || "0"),
        size: String(size),
        fee: Math.abs(fee).toFixed(6),
        feeAsset: "USDC",
        role,
        timestamp: (t.timestamp as number) || Date.now(),
        quoteAmount,
        realizedPnl,
      } as Trade;
    });
  }

  private mapLighterOrder(o: Record<string, unknown>, market?: MarketInfo): Order {
    // is_ask can be boolean true/false or number 1/0
    const isAsk = o.is_ask === true || (o.is_ask as number) === 1 || o.side === "sell";

    // Status: API may return string ("filled", "cancelled") or number
    let status: string;
    if (typeof o.status === "string") {
      status = STATUS_STRING_MAP[o.status.toLowerCase()] || o.status.toLowerCase() || "pending";
    } else {
      status = STATUS_MAP[o.status as number] || "pending";
    }

    // market_index is the correct field name (not market_id) in order responses
    const marketId = (o.market_index as number) ?? (o.market_id as number) ?? (o.m as number) ?? 0;

    const pricePrecision = market?.pricePrecision || 2;
    const sizePrecision = market?.sizePrecision || 3;

    // Lighter API returns price/size as decimal strings
    const rawPrice = o.price || o.p || "0";
    const rawSize = o.initial_base_amount || o.is || "0";
    const rawRemaining = o.remaining_base_amount || o.rs || "0";
    const rawTrigger = o.trigger_price || o.tp;

    // Order type: API may return string ("limit", "market") or number
    let orderType: string;
    if (typeof o.type === "string") {
      orderType = ORDER_TYPE_STRING_MAP[o.type.toLowerCase()] || o.type.toLowerCase() || "limit";
    } else {
      orderType = lighterOrderTypeToInternal(o.type as number || o.ot as number || 0);
    }

    // time_in_force: API may return string ("immediate-or-cancel", "good-till-time") or number
    let timeInForce: "ioc" | "gtc" = "gtc";
    if (typeof o.time_in_force === "string") {
      timeInForce = o.time_in_force.toLowerCase().includes("immediate") || o.time_in_force.toLowerCase() === "ioc" ? "ioc" : "gtc";
    } else {
      timeInForce = (o.time_in_force as number) === TIME_IN_FORCE_IOC ? "ioc" : "gtc";
    }

    return {
      orderId: String(o.order_index || o.i || ""),
      clientOrderId: o.client_order_index as number || o.u as number,
      marketId,
      marketSymbol: market?.symbol || `MARKET-${marketId}`,
      side: isAsk ? "sell" : "buy",
      orderType: orderType as Order["orderType"],
      size: String(Math.abs(parseFloat(String(rawSize)))),
      remainingSize: String(Math.abs(parseFloat(String(rawRemaining)))),
      price: String(rawPrice),
      triggerPrice: rawTrigger ? String(rawTrigger) : undefined,
      status: status as Order["status"],
      timeInForce,
      reduceOnly: o.reduce_only === true || (o.reduce_only as number || o.ro as number) === 1,
      createdAt: (o.created_at as number) || Date.now(),
      updatedAt: (o.updated_at as number) || Date.now(),
    };
  }
}
