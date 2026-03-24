
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RefreshCw, TrendingUp, TrendingDown, AlertCircle, Zap,
  ChevronsUpDown, Check, ChevronDown
} from "lucide-react";
import { useLocation } from "wouter";
import { createChart, ColorType, CrosshairMode, CandlestickSeries } from "lightweight-charts";
import type { IChartApi, CandlestickData, Time } from "lightweight-charts";

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

const RESOLUTIONS = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1d", value: "1d" },
];

// ─── Market Selector ──────────────────────────────────────────────────────────
function MarketSelector({ markets, value, onChange }: {
  markets: { marketId: number; symbol: string }[];
  value: number;
  onChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedMarket = markets.find(m => m.marketId === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-3 h-full hover:bg-white/5 transition-colors border-r border-border">
          <span className="text-base font-bold text-foreground">{selectedMarket?.symbol ?? "选择市场"}</span>
          <span className="text-xs text-muted-foreground">永续</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0 bg-popover border-border" align="start" sideOffset={0}>
        <Command>
          <CommandInput placeholder="搜索币种..." className="h-9 text-sm" />
          <CommandList className="max-h-72">
            <CommandEmpty>未找到匹配市场</CommandEmpty>
            <CommandGroup heading="主流币种">
              {markets.filter(m => PRIORITY_SYMBOLS.includes(m.symbol)).map(m => (
                <CommandItem
                  key={m.marketId}
                  value={m.symbol}
                  onSelect={() => { onChange(m.marketId); setOpen(false); }}
                  className="text-sm cursor-pointer font-medium"
                >
                  <Check className={`mr-2 h-3.5 w-3.5 ${m.marketId === value ? "opacity-100 text-primary" : "opacity-0"}`} />
                  {m.symbol}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="其他市场">
              {markets.filter(m => !PRIORITY_SYMBOLS.includes(m.symbol)).map(m => (
                <CommandItem
                  key={m.marketId}
                  value={m.symbol}
                  onSelect={() => { onChange(m.marketId); setOpen(false); }}
                  className="text-sm cursor-pointer"
                >
                  <Check className={`mr-2 h-3.5 w-3.5 ${m.marketId === value ? "opacity-100 text-primary" : "opacity-0"}`} />
                  {m.symbol}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Account Selector ─────────────────────────────────────────────────────────
function AccountSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const listQuery = trpc.exchange.list.useQuery(undefined, { staleTime: 60_000 });
  const accounts = listQuery.data || [];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-transparent border-0 border-r border-border rounded-none h-full px-3 text-sm text-muted-foreground hover:text-foreground focus:ring-0 focus:ring-offset-0 w-40">
        <SelectValue placeholder="选择账户" />
      </SelectTrigger>
      <SelectContent className="bg-popover border-border">
        {accounts.map(a => (
          <SelectItem key={a.id} value={String(a.id)} className="text-foreground text-sm">
            {a.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── K 线图 ───────────────────────────────────────────────────────────────────
function KLineChart({ marketId, symbol, resolution, onResolutionChange }: {
  marketId: number;
  symbol: string;
  resolution: string;
  onResolutionChange: (r: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchCandles = useCallback(async (res: string, mid: number) => {
    setLoading(true);
    try {
      const now = Date.now();
      const resMs: Record<string, number> = {
        "1m": 60_000, "5m": 300_000, "15m": 900_000,
        "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
      };
      const barMs = resMs[res] || 900_000;
      const countBack = 200;
      const start = now - barMs * countBack;
      const url = `https://mainnet.zklighter.elliot.ai/api/v1/candles?market_id=${mid}&resolution=${res}&start_timestamp=${start}&end_timestamp=${now}&count_back=${countBack}`;
      const resp = await fetch(url);
      const json = await resp.json();
      const rawCandles = (json.c || json.candles || []) as Record<string, number>[];
      const candles: CandlestickData[] = rawCandles.map((c) => ({
        time: Math.floor(c.t / 1000) as Time,
        open: c.o, high: c.h, low: c.l, close: c.c,
      }));
      if (seriesRef.current && candles.length > 0) {
        seriesRef.current.setData(candles);
        chartRef.current?.timeScale().fitContent();
      }
    } catch (_) {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#6b7280",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 320,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderUpColor: "#16a34a",
      borderDownColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
    });
    chartRef.current = chart;
    seriesRef.current = series;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        chart.applyOptions({ width: e.contentRect.width, height: e.contentRect.height });
      }
    });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, []);

  useEffect(() => {
    if (seriesRef.current) fetchCandles(resolution, marketId);
  }, [marketId, resolution, fetchCandles]);

  return (
    <div className="flex flex-col h-full">
      {/* 时间周期栏 */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border">
        {RESOLUTIONS.map(r => (
          <button
            key={r.value}
            onClick={() => onResolutionChange(r.value)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              resolution === r.value
                ? "bg-primary/20 text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            {r.label}
          </button>
        ))}
        {loading && <RefreshCw className="h-3 w-3 ml-2 animate-spin text-muted-foreground" />}
      </div>
      {/* 图表区域 */}
      <div ref={containerRef} className="flex-1 min-h-0 w-full" />
    </div>
  );
}

// ─── Order Book ───────────────────────────────────────────────────────────────
function OrderBookPanel({ accountId, marketId }: { accountId: number; marketId: number }) {
  const query = trpc.account.orderBook.useQuery(
    { accountId, marketId },
    { refetchInterval: 2000, staleTime: 1000, retry: false }
  );
  const ob = query.data;

  if (query.isLoading) return (
    <div className="p-3 space-y-1">
      {Array.from({ length: 16 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
    </div>
  );
  if (query.error || !ob) return (
    <div className="flex items-center justify-center h-full text-xs text-muted-foreground gap-1.5">
      <AlertCircle className="h-3.5 w-3.5" />无法加载订单簿
    </div>
  );

  const maxSize = Math.max(
    ...ob.asks.map(a => parseFloat(a.size)),
    ...ob.bids.map(b => parseFloat(b.size)),
    1
  );
  const midPrice = ob.asks[0] && ob.bids[0]
    ? ((parseFloat(ob.asks[0].price) + parseFloat(ob.bids[0].price)) / 2)
    : null;
  const spread = ob.asks[0] && ob.bids[0]
    ? (parseFloat(ob.asks[0].price) - parseFloat(ob.bids[0].price))
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* 表头 */}
      <div className="grid grid-cols-2 text-xs text-muted-foreground px-3 py-1.5 border-b border-border">
        <span>价格(USDC)</span>
        <span className="text-right">数量</span>
      </div>
      {/* Asks */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-end">
        {ob.asks.slice(0, 10).reverse().map((ask, i) => (
          <div key={i} className="relative flex justify-between text-xs px-3 py-[3px] hover:bg-white/5">
            <div className="absolute inset-y-0 right-0 bg-sell/10" style={{ width: `${(parseFloat(ask.size) / maxSize) * 100}%` }} />
            <span className="num text-sell relative z-10">{parseFloat(ask.price).toFixed(2)}</span>
            <span className="num text-foreground/80 relative z-10">{parseFloat(ask.size).toFixed(4)}</span>
          </div>
        ))}
      </div>
      {/* 中间价 */}
      <div className="px-3 py-2 border-y border-border bg-card/50">
        {midPrice !== null ? (
          <div className="flex items-center justify-between">
            <span className="num font-bold text-sm text-foreground">{midPrice.toFixed(2)}</span>
            {spread !== null && (
              <span className="text-xs text-muted-foreground">差价 {spread.toFixed(2)}</span>
            )}
          </div>
        ) : null}
      </div>
      {/* Bids */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {ob.bids.slice(0, 10).map((bid, i) => (
          <div key={i} className="relative flex justify-between text-xs px-3 py-[3px] hover:bg-white/5">
            <div className="absolute inset-y-0 right-0 bg-buy/10" style={{ width: `${(parseFloat(bid.size) / maxSize) * 100}%` }} />
            <span className="num text-buy relative z-10">{parseFloat(bid.price).toFixed(2)}</span>
            <span className="num text-foreground/80 relative z-10">{parseFloat(bid.size).toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Positions Panel ──────────────────────────────────────────────────────────
function PositionsPanel({ accountId }: { accountId: number }) {
  const query = trpc.account.positions.useQuery({ accountId }, { refetchInterval: 5000, staleTime: 2000, retry: false });
  const positions = query.data || [];

  if (query.isLoading) return (
    <div className="p-3 space-y-2">
      {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  );
  if (query.error) {
    const errCode = (query.error as { data?: { code?: string } }).data?.code;
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground gap-1.5">
        <AlertCircle className="h-3.5 w-3.5" />
        {errCode === "NOT_FOUND" ? "账户不存在" : "认证失败，请检查私钥"}
      </div>
    );
  }
  if (positions.length === 0) return (
    <div className="flex items-center justify-center h-full text-xs text-muted-foreground">暂无持仓</div>
  );

  return (
    <div className="overflow-auto">
      {/* 表头 */}
      <div className="grid grid-cols-4 text-xs text-muted-foreground px-3 py-1.5 border-b border-border sticky top-0 bg-card">
        <span>市场</span>
        <span className="text-right">均价</span>
        <span className="text-right">数量</span>
        <span className="text-right">未实现盈亏</span>
      </div>
      {positions.map((pos, i) => {
        const pnl = parseFloat(pos.unrealizedPnl);
        return (
          <div key={i} className="grid grid-cols-4 items-center text-xs px-3 py-2.5 border-b border-border/50 hover:bg-white/5">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">{pos.marketSymbol}</span>
              <Badge className={`text-[10px] h-3.5 px-1 ${pos.side === "long" ? "bg-buy/15 text-buy border-buy/20" : "bg-sell/15 text-sell border-sell/20"}`}>
                {pos.side === "long" ? "多" : "空"}
              </Badge>
            </div>
            <span className="num text-right text-foreground/80">{parseFloat(pos.entryPrice).toFixed(2)}</span>
            <span className="num text-right text-foreground/80">{pos.size}</span>
            <span className={`num text-right font-medium ${pnl >= 0 ? "text-buy" : "text-sell"}`}>
              {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Order Form ───────────────────────────────────────────────────────────────
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
      setSize(""); setPrice(""); setTriggerPrice("");
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
    createOrder.mutate({ accountId, marketId, side, orderType, size, price: needsPrice ? price : undefined, triggerPrice: needsTrigger ? triggerPrice : undefined, reduceOnly });
  };

  return (
    <div className="flex flex-col h-full">
      {/* 买入/卖出切换 */}
      <div className="grid grid-cols-2 border-b border-border">
        <button
          type="button"
          onClick={() => setSide("buy")}
          className={`py-2.5 text-sm font-semibold transition-all border-b-2 ${side === "buy" ? "text-buy border-buy" : "text-muted-foreground border-transparent hover:text-foreground"}`}
        >
          买入 / 做多
        </button>
        <button
          type="button"
          onClick={() => setSide("sell")}
          className={`py-2.5 text-sm font-semibold transition-all border-b-2 ${side === "sell" ? "text-sell border-sell" : "text-muted-foreground border-transparent hover:text-foreground"}`}
        >
          卖出 / 做空
        </button>
      </div>

      {/* 表单内容 */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-3 flex-1">
        {/* 订单类型 */}
        <Select value={orderType} onValueChange={v => setOrderType(v as OrderType)}>
          <SelectTrigger className="bg-input border-border text-foreground h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            {(Object.keys(ORDER_TYPE_LABELS) as OrderType[]).map(t => (
              <SelectItem key={t} value={t} className="text-foreground text-sm">{ORDER_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 价格 */}
        {needsPrice && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">价格 (USDC)</Label>
            <Input type="number" step="0.01" min="0" placeholder="输入价格" value={price}
              onChange={e => setPrice(e.target.value)}
              className="bg-input border-border text-foreground num h-8 text-sm" />
          </div>
        )}

        {/* 触发价格 */}
        {needsTrigger && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">触发价格 (USDC)</Label>
            <Input type="number" step="0.01" min="0" placeholder="输入触发价格" value={triggerPrice}
              onChange={e => setTriggerPrice(e.target.value)}
              className="bg-input border-border text-foreground num h-8 text-sm" />
          </div>
        )}

        {/* 数量 */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">数量 ({marketSymbol})</Label>
          <Input type="number" step="0.001" min="0" placeholder="输入数量" value={size}
            onChange={e => setSize(e.target.value)}
            className="bg-input border-border text-foreground num h-8 text-sm" />
        </div>

        {/* 仅减仓 */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={reduceOnly} onChange={e => setReduceOnly(e.target.checked)} className="w-3.5 h-3.5 accent-primary" />
          <span className="text-xs text-muted-foreground">仅减仓 (Reduce Only)</span>
        </label>

        {/* 提交 */}
        <Button
          type="submit"
          className={`w-full font-semibold h-9 mt-auto ${side === "buy" ? "bg-buy hover:bg-buy/90" : "bg-sell hover:bg-sell/90"} text-white`}
          disabled={createOrder.isPending}
        >
          {createOrder.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : (
            side === "buy"
              ? <><TrendingUp className="h-4 w-4 mr-1.5" />买入 {marketSymbol}</>
              : <><TrendingDown className="h-4 w-4 mr-1.5" />卖出 {marketSymbol}</>
          )}
        </Button>
      </form>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TradingPage() {
  const params = useParams<{ accountId?: string }>();
  const [, setLocation] = useLocation();
  const [selectedAccountId, setSelectedAccountId] = useState(params.accountId || "");
  const [selectedMarketId, setSelectedMarketId] = useState<number>(0);
  const [resolution, setResolution] = useState("15m");

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
  const sortedMarkets = useMemo(() => sortMarkets(markets), [markets]);
  const selectedMarket = markets.find(m => m.marketId === selectedMarketId);

  useEffect(() => {
    if (markets.length > 0 && selectedMarketId === 0) {
      const preferred = sortedMarkets.find(m => m.symbol === "ETH") || sortedMarkets.find(m => m.symbol === "BTC") || sortedMarkets[0];
      setSelectedMarketId(preferred.marketId);
    }
  }, [markets, selectedMarketId, sortedMarkets]);

  useEffect(() => {
    if (params.accountId) setSelectedAccountId(params.accountId);
  }, [params.accountId]);

  const exchangesQuery = trpc.exchange.list.useQuery(undefined, { staleTime: 60_000, retry: false });
  const hasAccounts = (exchangesQuery.data?.length || 0) > 0;

  const accountNotFound = !!accountId && (
    (marketsQuery.error && (marketsQuery.error as { data?: { code?: string } }).data?.code === "NOT_FOUND") ||
    (balanceQuery.error && (balanceQuery.error as { data?: { code?: string } }).data?.code === "NOT_FOUND")
  );

  if (!hasAccounts && !exchangesQuery.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium">尚未配置交易所账户</p>
          <p className="text-xs text-muted-foreground mt-1">请先添加您的 Lighter.xyz API Key</p>
        </div>
        <Button size="sm" onClick={() => setLocation("/exchanges")}>前往配置</Button>
      </div>
    );
  }

  if (accountNotFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium">账户不存在或已被删除</p>
          <p className="text-xs text-muted-foreground mt-1">请重新选择有效的交易账户</p>
        </div>
        <Button size="sm" onClick={() => { setSelectedAccountId(""); setLocation("/trading"); }}>返回交易页</Button>
      </div>
    );
  }

  const bal = balanceQuery.data;

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] overflow-hidden">
      {/* ── 顶部 Header ── */}
      <div className="flex items-stretch h-12 border-b border-border bg-card shrink-0">
        {/* 账户选择 */}
        <AccountSelector
          value={selectedAccountId}
          onChange={v => { setSelectedAccountId(v); setSelectedMarketId(0); }}
        />

        {/* 市场选择 */}
        {accountId && markets.length > 0 ? (
          <MarketSelector markets={sortedMarkets} value={selectedMarketId} onChange={setSelectedMarketId} />
        ) : (
          <div className="flex items-center px-3 border-r border-border">
            <span className="text-sm text-muted-foreground">
              {!accountId ? "请先选择账户" : <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            </span>
          </div>
        )}

        {/* 账户余额信息 */}
        {bal && (
          <div className="flex items-center gap-5 px-4 ml-auto text-xs">
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground">可用余额</span>
              <span className="num font-medium text-foreground">${parseFloat(bal.availableBalance).toFixed(2)}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground">占用保证金</span>
              <span className="num font-medium text-foreground">${parseFloat(bal.usedMargin).toFixed(2)}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground">未实现盈亏</span>
              <span className={`num font-medium ${parseFloat(bal.unrealizedPnl) >= 0 ? "text-buy" : "text-sell"}`}>
                {parseFloat(bal.unrealizedPnl) >= 0 ? "+" : ""}{parseFloat(bal.unrealizedPnl).toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── 主体内容 ── */}
      {!accountId ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <Zap className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">请先选择交易账户</p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* 左侧：订单簿 */}
          <div className="w-52 shrink-0 border-r border-border flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold text-muted-foreground">订单簿</span>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {selectedMarket ? (
                <OrderBookPanel accountId={accountId} marketId={selectedMarket.marketId} />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">请选择市场</div>
              )}
            </div>
          </div>

          {/* 中间：K 线图 + 下单表单 */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            {/* K 线图 */}
            <div className="flex-1 min-h-0 border-b border-border">
              {selectedMarket ? (
                <KLineChart
                  marketId={selectedMarket.marketId}
                  symbol={selectedMarket.symbol}
                  resolution={resolution}
                  onResolutionChange={setResolution}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">请选择市场</div>
              )}
            </div>
            {/* 下单表单 */}
            <div className="h-72 shrink-0 overflow-hidden">
              {marketsQuery.isLoading ? (
                <div className="p-3 space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : selectedMarket ? (
                <OrderForm accountId={accountId} marketId={selectedMarket.marketId} marketSymbol={selectedMarket.symbol} />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">请选择市场</div>
              )}
            </div>
          </div>

          {/* 右侧：持仓 */}
          <div className="w-80 shrink-0 border-l border-border flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold text-muted-foreground">当前持仓</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <PositionsPanel accountId={accountId} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
