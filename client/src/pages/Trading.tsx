import { trpc } from "@/lib/trpc";
import { useState, useEffect, useMemo } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { RefreshCw, TrendingUp, TrendingDown, AlertCircle, Zap, BookOpen, Search } from "lucide-react";
import { useLocation } from "wouter";

// 主流币种优先排序
const PRIORITY_SYMBOLS = ["BTC", "ETH", "XAU", "XAG", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "DOT", "LINK", "LTC", "BCH"];

function sortMarkets(markets: { marketId: number; symbol: string }[]) {
  return [...markets].sort((a, b) => {
    const ai = PRIORITY_SYMBOLS.indexOf(a.symbol);
    const bi = PRIORITY_SYMBOLS.indexOf(b.symbol);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.symbol.localeCompare(b.symbol);
  });
}

type OrderType = "market" | "limit" | "stop_loss" | "take_profit" | "stop_loss_limit" | "take_profit_limit";
type OrderSide = "buy" | "sell";

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  market: "市价单",
  limit: "限价单",
  stop_loss: "止损单",
  take_profit: "止盈单",
  stop_loss_limit: "止损限价单",
  take_profit_limit: "止盈限价单",
};

function MarketSelector({ markets, value, onChange }: {
  markets: { marketId: number; symbol: string }[];
  value: number;
  onChange: (v: number) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return markets;
    return markets.filter(m => m.symbol.toLowerCase().includes(search.toLowerCase()));
  }, [markets, search]);

  const selectedMarket = markets.find(m => m.marketId === value);

  return (
    <Select value={String(value)} onValueChange={v => { onChange(parseInt(v)); setSearch(""); }}>
      <SelectTrigger className="bg-input border-border text-foreground h-9 text-sm w-44">
        <SelectValue placeholder="选择市场">
          {selectedMarket ? (
            <span className="font-semibold">{selectedMarket.symbol}</span>
          ) : "选择市场"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-popover border-border w-52">
        {/* 搜索框 */}
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border sticky top-0 bg-popover z-10">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder="搜索币种..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          />
        </div>
        {/* 市场列表 */}
        {filtered.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">未找到匹配市场</div>
        ) : (
          filtered.map((m, idx) => (
            <SelectItem key={m.marketId} value={String(m.marketId)} className="text-foreground text-sm">
              <span className={idx < PRIORITY_SYMBOLS.length && PRIORITY_SYMBOLS.includes(m.symbol) ? "font-semibold" : ""}>
                {m.symbol}
              </span>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

function AccountSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const listQuery = trpc.exchange.list.useQuery(undefined, { staleTime: 60_000 });
  const accounts = listQuery.data || [];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-input border-border text-foreground h-9 text-sm">
        <SelectValue placeholder="选择交易账户" />
      </SelectTrigger>
      <SelectContent className="bg-popover border-border">
        {accounts.map(a => (
          <SelectItem key={a.id} value={String(a.id)} className="text-foreground">
            {a.label} <span className="text-muted-foreground text-xs ml-1">({a.exchangeType})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OrderBookPanel({ accountId, marketId }: { accountId: number; marketId: number }) {
  const query = trpc.account.orderBook.useQuery(
    { accountId, marketId },
    { refetchInterval: 3000, staleTime: 1000, retry: false }
  );
  const ob = query.data;

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.error) return (
    <Card className="bg-card border-border">
      <CardContent className="py-4 text-center text-xs text-destructive/70 flex items-center justify-center gap-1.5">
        <AlertCircle className="h-3.5 w-3.5" />无法加载订单簿
      </CardContent>
    </Card>
  );
  if (!ob) return null;

  const maxSize = Math.max(
    ...ob.asks.map(a => parseFloat(a.size)),
    ...ob.bids.map(b => parseFloat(b.size)),
    1
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
          <BookOpen className="h-3.5 w-3.5" /> 订单簿
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground mb-1 px-1">
          <span>价格 (USDC)</span>
          <span className="text-right">数量</span>
        </div>
        {/* Asks */}
        <div className="space-y-0.5 mb-1">
          {ob.asks.slice(0, 8).reverse().map((ask, i) => (
            <div key={i} className="relative flex justify-between text-xs px-1 py-0.5 rounded overflow-hidden">
              <div
                className="absolute inset-y-0 right-0 bg-sell/10"
                style={{ width: `${(parseFloat(ask.size) / maxSize) * 100}%` }}
              />
              <span className="num text-sell relative z-10">{parseFloat(ask.price).toFixed(2)}</span>
              <span className="num text-foreground relative z-10">{parseFloat(ask.size).toFixed(4)}</span>
            </div>
          ))}
        </div>
        {/* Spread */}
        {ob.asks[0] && ob.bids[0] && (
          <div className="text-center text-xs text-muted-foreground py-1 border-y border-border my-1">
            <span className="num font-medium text-foreground">
              ${((parseFloat(ob.asks[0].price) + parseFloat(ob.bids[0].price)) / 2).toFixed(2)}
            </span>
            <span className="ml-2 text-muted-foreground">
              差价: {(parseFloat(ob.asks[0].price) - parseFloat(ob.bids[0].price)).toFixed(2)}
            </span>
          </div>
        )}
        {/* Bids */}
        <div className="space-y-0.5 mt-1">
          {ob.bids.slice(0, 8).map((bid, i) => (
            <div key={i} className="relative flex justify-between text-xs px-1 py-0.5 rounded overflow-hidden">
              <div
                className="absolute inset-y-0 right-0 bg-buy/10"
                style={{ width: `${(parseFloat(bid.size) / maxSize) * 100}%` }}
              />
              <span className="num text-buy relative z-10">{parseFloat(bid.price).toFixed(2)}</span>
              <span className="num text-foreground relative z-10">{parseFloat(bid.size).toFixed(4)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PositionsPanel({ accountId }: { accountId: number }) {
  const query = trpc.account.positions.useQuery({ accountId }, { refetchInterval: 5000, staleTime: 2000, retry: false });
  const positions = query.data || [];

  if (query.isLoading) return <Skeleton className="h-24 w-full" />;
  if (query.error) {
    const errCode = (query.error as { data?: { code?: string } }).data?.code;
    const errMsg = errCode === "NOT_FOUND"
      ? "账户不存在或已被删除"
      : "认证失败，请检查私钥";
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-4 text-center text-xs text-destructive/70 flex items-center justify-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" />{errMsg}
        </CardContent>
      </Card>
    );
  }
  if (positions.length === 0) return (
    <Card className="bg-card border-border">
      <CardContent className="py-6 text-center text-sm text-muted-foreground">暂无持仓</CardContent>
    </Card>
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-xs font-semibold text-muted-foreground">当前持仓</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {positions.map((pos, i) => {
          const pnlNum = parseFloat(pos.unrealizedPnl);
          const isPos = pnlNum >= 0;
          return (
            <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{pos.marketSymbol}</span>
                  <Badge className={`text-xs h-4 ${pos.side === "long" ? "bg-buy/10 text-buy border-buy/20" : "bg-sell/10 text-sell border-sell/20"}`}>
                    {pos.side === "long" ? "多" : "空"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 num">
                  均价: {parseFloat(pos.entryPrice).toFixed(2)} | 数量: {pos.size}
                </div>
              </div>
              <div className="text-right">
                <p className={`text-sm font-semibold num ${isPos ? "text-buy" : "text-sell"}`}>
                  {isPos ? "+" : ""}{pnlNum.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground num">未实现盈亏</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function OrderForm({ accountId, marketId, marketSymbol }: { accountId: number; marketId: number; marketSymbol: string }) {
  const [side, setSide] = useState<OrderSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [reduceOnly, setReduceOnly] = useState(false);

  const utils = trpc.useUtils();
  const createOrder = trpc.trading.createOrder.useMutation({
    onSuccess: (order) => {
      toast.success(`订单已提交 #${order.orderId}`);
      setSize("");
      setPrice("");
      setTriggerPrice("");
      utils.account.positions.invalidate({ accountId });
      utils.history.activeOrders.invalidate({ accountId });
    },
    onError: (err) => toast.error(`下单失败: ${err.message}`),
  });

  const needsPrice = orderType !== "market";
  const needsTrigger = ["stop_loss", "take_profit", "stop_loss_limit", "take_profit_limit"].includes(orderType);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!size || parseFloat(size) <= 0) return toast.error("请输入有效的数量");
    if (needsPrice && !price) return toast.error("请输入价格");
    if (needsTrigger && !triggerPrice) return toast.error("请输入触发价格");

    createOrder.mutate({
      accountId,
      marketId,
      side,
      orderType,
      size,
      price: needsPrice ? price : undefined,
      triggerPrice: needsTrigger ? triggerPrice : undefined,
      reduceOnly,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Buy/Sell Toggle */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-secondary rounded-lg">
        <button
          type="button"
          onClick={() => setSide("buy")}
          className={`py-2 rounded-md text-sm font-semibold transition-all ${side === "buy" ? "bg-buy text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          买入 / 做多
        </button>
        <button
          type="button"
          onClick={() => setSide("sell")}
          className={`py-2 rounded-md text-sm font-semibold transition-all ${side === "sell" ? "bg-sell text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          卖出 / 做空
        </button>
      </div>

      {/* Order Type */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">订单类型</Label>
        <Select value={orderType} onValueChange={v => setOrderType(v as OrderType)}>
          <SelectTrigger className="bg-input border-border text-foreground h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            {(Object.keys(ORDER_TYPE_LABELS) as OrderType[]).map(t => (
              <SelectItem key={t} value={t} className="text-foreground text-sm">
                {ORDER_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Price */}
      {needsPrice && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">价格 (USDC)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="输入价格"
            value={price}
            onChange={e => setPrice(e.target.value)}
            className="bg-input border-border text-foreground num h-9 text-sm"
          />
        </div>
      )}

      {/* Trigger Price */}
      {needsTrigger && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">触发价格 (USDC)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="输入触发价格"
            value={triggerPrice}
            onChange={e => setTriggerPrice(e.target.value)}
            className="bg-input border-border text-foreground num h-9 text-sm"
          />
        </div>
      )}

      {/* Size */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">数量</Label>
        <Input
          type="number"
          step="0.001"
          min="0"
          placeholder="输入数量"
          value={size}
          onChange={e => setSize(e.target.value)}
          className="bg-input border-border text-foreground num h-9 text-sm"
        />
      </div>

      {/* Reduce Only */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={reduceOnly}
          onChange={e => setReduceOnly(e.target.checked)}
          className="w-4 h-4 accent-primary"
        />
        <span className="text-xs text-muted-foreground">仅减仓 (Reduce Only)</span>
      </label>

      {/* Submit */}
      <Button
        type="submit"
        className={`w-full font-semibold ${side === "buy" ? "bg-buy hover:bg-buy/90" : "bg-sell hover:bg-sell/90"} text-white`}
        disabled={createOrder.isPending}
      >
        {createOrder.isPending ? (
          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
        ) : side === "buy" ? (
          <TrendingUp className="h-4 w-4 mr-2" />
        ) : (
          <TrendingDown className="h-4 w-4 mr-2" />
        )}
        {createOrder.isPending ? "提交中..." : `${ORDER_TYPE_LABELS[orderType]} ${side === "buy" ? "买入" : "卖出"} ${marketSymbol}`}
      </Button>
    </form>
  );
}

export default function TradingPage() {
  const params = useParams<{ accountId?: string }>();
  const [, setLocation] = useLocation();
  const [selectedAccountId, setSelectedAccountId] = useState(params.accountId || "");
  const [selectedMarketId, setSelectedMarketId] = useState<number>(0);

  const accountId = selectedAccountId ? parseInt(selectedAccountId) : null;

  const marketsQuery = trpc.account.markets.useQuery(
    { accountId: accountId! },
    { enabled: !!accountId, staleTime: 60_000, retry: false }
  );
  const balanceQuery = trpc.account.balance.useQuery(
    { accountId: accountId! },
    { enabled: !!accountId, refetchInterval: 10_000, staleTime: 5_000, retry: false }
  );

  const markets = marketsQuery.data || [];
  const selectedMarket = markets.find(m => m.marketId === selectedMarketId);

  useEffect(() => {
    if (markets.length > 0 && selectedMarketId === 0) {
      // 优先选择 ETH，其次 BTC，最后选第一个
      const sorted = sortMarkets(markets);
      const preferred = sorted.find(m => m.symbol === "ETH") ||
                        sorted.find(m => m.symbol === "BTC") ||
                        sorted[0];
      setSelectedMarketId(preferred.marketId);
    }
  }, [markets, selectedMarketId]);

  useEffect(() => {
    if (params.accountId) setSelectedAccountId(params.accountId);
  }, [params.accountId]);

  const exchangesQuery = trpc.exchange.list.useQuery(undefined, { staleTime: 60_000, retry: false });
  const hasAccounts = (exchangesQuery.data?.length || 0) > 0;

  // 检查账户是否存在（NOT_FOUND 错误）
  const accountNotFound = !!accountId && (
    (marketsQuery.error && (marketsQuery.error as { data?: { code?: string } }).data?.code === "NOT_FOUND") ||
    (balanceQuery.error && (balanceQuery.error as { data?: { code?: string } }).data?.code === "NOT_FOUND")
  );

  if (!hasAccounts && !exchangesQuery.isLoading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">尚未配置交易所账户</p>
          <p className="text-xs text-muted-foreground mt-1">请先添加您的 Lighter.xyz API Key</p>
        </div>
        <Button size="sm" onClick={() => setLocation("/exchanges")}>前往配置</Button>
      </div>
    );
  }

  if (accountNotFound) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">账户不存在或已被删除</p>
          <p className="text-xs text-muted-foreground mt-1">请重新选择有效的交易账户</p>
        </div>
        <Button size="sm" onClick={() => { setSelectedAccountId(""); setLocation("/trading"); }}>返回交易页</Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-7xl">
      {/* Top Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h1 className="text-base font-bold text-foreground">交易执行</h1>
        </div>
        <div className="w-48">
          <AccountSelector value={selectedAccountId} onChange={v => { setSelectedAccountId(v); setSelectedMarketId(0); }} />
        </div>
        {accountId && markets.length > 0 && (
          <MarketSelector
            markets={sortMarkets(markets)}
            value={selectedMarketId}
            onChange={setSelectedMarketId}
          />
        )}
        {balanceQuery.data && (
          <div className="ml-auto flex items-center gap-4 text-xs">
            <span className="text-muted-foreground">可用: <span className="num text-foreground font-medium">${parseFloat(balanceQuery.data.availableBalance).toFixed(2)}</span></span>
            <span className="text-muted-foreground">保证金: <span className="num text-foreground font-medium">${parseFloat(balanceQuery.data.usedMargin).toFixed(2)}</span></span>
            <span className={`num font-medium ${parseFloat(balanceQuery.data.unrealizedPnl) >= 0 ? "text-buy" : "text-sell"}`}>
              未实现盈亏: {parseFloat(balanceQuery.data.unrealizedPnl) >= 0 ? "+" : ""}{parseFloat(balanceQuery.data.unrealizedPnl).toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {!accountId ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Zap className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">请先选择交易账户</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Order Book */}
          <div className="lg:col-span-3">
            {selectedMarket && (
              <OrderBookPanel accountId={accountId} marketId={selectedMarket.marketId} />
            )}
          </div>

          {/* Order Form */}
          <div className="lg:col-span-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-foreground">
                  {selectedMarket ? selectedMarket.symbol : "下单"}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {marketsQuery.isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9 w-full" />)}
                  </div>
                ) : selectedMarket ? (
                  <OrderForm
                    accountId={accountId}
                    marketId={selectedMarket.marketId}
                    marketSymbol={selectedMarket.symbol}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">请选择交易市场</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Positions */}
          <div className="lg:col-span-5">
            <PositionsPanel accountId={accountId} />
          </div>
        </div>
      )}
    </div>
  );
}
