/**
 * Unified Exchange Service Interface
 * All exchange adapters must implement this interface.
 * This enables the adapter pattern for multi-exchange support.
 */

export interface AccountBalance {
  totalValue: string;       // Total account value in USD
  availableBalance: string; // Available for trading
  usedMargin: string;       // Margin currently in use
  unrealizedPnl: string;    // Unrealized P&L across all positions
  collateral: string;       // Collateral amount
}

export interface Position {
  marketId: number;
  marketSymbol: string;     // e.g. "ETH-PERP"
  side: "long" | "short";
  size: string;             // Position size in base asset
  entryPrice: string;       // Average entry price
  markPrice: string;        // Current mark price
  positionValue: string;    // Current position value
  unrealizedPnl: string;
  realizedPnl: string;
  leverage: number;
  openOrderCount: number;
}

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface OrderBook {
  marketSymbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface MarketInfo {
  marketId: number;
  symbol: string;           // e.g. "ETH-PERP"
  baseAsset: string;
  quoteAsset: string;
  pricePrecision: number;
  sizePrecision: number;
  minOrderSize: string;
  maxLeverage: number;
}

export type OrderType = "market" | "limit" | "stop_loss" | "take_profit" | "stop_loss_limit" | "take_profit_limit";
export type OrderSide = "buy" | "sell";
export type TimeInForce = "gtc" | "ioc" | "fok" | "gtt";

export interface CreateOrderParams {
  marketId: number;
  side: OrderSide;
  orderType: OrderType;
  size: string;             // Base amount as decimal string
  price?: string;           // Required for limit orders
  triggerPrice?: string;    // Required for SL/TP orders
  timeInForce?: TimeInForce;
  reduceOnly?: boolean;
  postOnly?: boolean;
  clientOrderId?: number;   // Optional client-provided order ID
  expiry?: number;          // Unix timestamp for GTT orders
}

export interface Order {
  orderId: string;
  clientOrderId?: number;
  marketId: number;
  marketSymbol: string;
  side: OrderSide;
  orderType: OrderType;
  size: string;
  remainingSize: string;
  price: string;
  triggerPrice?: string;
  status: OrderStatus;
  timeInForce: string;
  reduceOnly: boolean;
  createdAt: number;        // Unix timestamp ms
  updatedAt: number;
}

export type OrderStatus =
  | "pending"
  | "active"
  | "filled"
  | "cancelled"
  | "expired"
  | "triggered";

export interface Trade {
  tradeId: string;
  orderId: string;
  marketId: number;
  marketSymbol: string;
  side: OrderSide;
  price: string;
  size: string;
  fee: string;
  feeAsset: string;
  role: "maker" | "taker";
  timestamp: number;        // Unix timestamp ms
  quoteAmount?: string;     // price × size (成交金额)
  realizedPnl?: string;     // Realized PnL for this trade (if available)
}

export interface CancelOrderParams {
  marketId: number;
  orderId: string;
}

export interface GetOrdersParams {
  marketId?: number;
  status?: "active" | "inactive";
  limit?: number;
  cursor?: string;
}

export interface GetTradesParams {
  marketId?: number;
  limit?: number;
  cursor?: string;
}

/**
 * Core interface every exchange adapter must implement.
 */
export interface IExchangeService {
  exchangeType: string;

  // Account
  getBalance(): Promise<AccountBalance>;
  getPositions(): Promise<Position[]>;
  getMarkets(): Promise<MarketInfo[]>;
  getOrderBook(marketId: number): Promise<OrderBook>;

  // Trading
  createOrder(params: CreateOrderParams): Promise<Order>;
  cancelOrder(params: CancelOrderParams): Promise<boolean>;
  cancelAllOrders(marketId?: number): Promise<number>;

  // History
  getActiveOrders(params?: GetOrdersParams): Promise<Order[]>;
  getOrderHistory(params?: GetOrdersParams): Promise<Order[]>;
  getTradeHistory(params?: GetTradesParams): Promise<Trade[]>;
}

export interface ExchangeCredentials {
  accountIndex: string;
  apiKeyIndex: string;
  apiPrivateKey: string;    // Decrypted private key (only in memory, never stored plain)
  l1Address?: string;
}
