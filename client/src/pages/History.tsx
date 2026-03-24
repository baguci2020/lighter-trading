import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { RefreshCw, X, History, AlertCircle } from "lucide-react";

type Order = {
  orderId: string;
  marketSymbol: string;
  side: "buy" | "sell";
  orderType: string;
  size: string;
  remainingSize: string;
  price: string;
  triggerPrice?: string;
  status: string;
  timeInForce: string;
  reduceOnly: boolean;
  createdAt: number;
  updatedAt: number;
  marketId: number;
};

type Trade = {
  tradeId: string;
  marketSymbol: string;
  side: "buy" | "sell";
  price: string;
  size: string;
  fee: string;
  feeAsset: string;
  role: string;
  timestamp: number;
  quoteAmount?: string;   // 成交金额
  realizedPnl?: string;  // 已实现盈亏
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  market: "市价",
  limit: "限价",
  stop_loss: "止损",
  take_profit: "止盈",
  stop_loss_limit: "止损限价",
  take_profit_limit: "止盈限价",
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "待处理", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  active: { label: "活跃", className: "bg-buy/10 text-buy border-buy/20" },
  filled: { label: "已成交", className: "bg-primary/10 text-primary border-primary/20" },
  cancelled: { label: "已撤销", className: "bg-muted text-muted-foreground border-border" },
  expired: { label: "已过期", className: "bg-muted text-muted-foreground border-border" },
  triggered: { label: "已触发", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
};

function AccountSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const listQuery = trpc.exchange.list.useQuery(undefined, { staleTime: 60_000 });
  const accounts = listQuery.data || [];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-input border-border text-foreground h-9 text-sm w-48">
        <SelectValue placeholder="选择交易账户" />
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

function ActiveOrdersTab({ accountId }: { accountId: number }) {
  const utils = trpc.useUtils();
  const query = trpc.history.activeOrders.useQuery(
    { accountId, limit: 50 },
    { refetchInterval: 5000, staleTime: 2000 }
  );
  const orders: Order[] = (query.data || []) as Order[];

  const cancelMutation = trpc.trading.cancelOrder.useMutation({
    onSuccess: () => {
      toast.success("订单已撤销");
      utils.history.activeOrders.invalidate({ accountId });
    },
    onError: (err) => toast.error(`撤单失败: ${err.message}`),
  });

  const cancelAllMutation = trpc.trading.cancelAllOrders.useMutation({
    onSuccess: (data) => {
      toast.success(`已撤销 ${data.cancelled} 个订单`);
      utils.history.activeOrders.invalidate({ accountId });
    },
    onError: (err) => toast.error(`撤单失败: ${err.message}`),
  });

  if (query.isLoading) return <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>;
  if (query.error) return (
    <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
      <AlertCircle className="h-8 w-8 text-destructive/60" />
      <p className="text-destructive/80">认证失败：请检查您的 API Key 和私钥是否正确</p>
    </div>
  );

  return (
    <div>
      {orders.length > 0 && (
        <div className="flex justify-end px-4 py-2 border-b border-border">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => cancelAllMutation.mutate({ accountId })}
            disabled={cancelAllMutation.isPending}
          >
            {cancelAllMutation.isPending ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
            全部撤单
          </Button>
        </div>
      )}
      {orders.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">暂无活跃委托</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">市场</th>
                <th className="text-left px-4 py-2 font-medium">方向</th>
                <th className="text-left px-4 py-2 font-medium">类型</th>
                <th className="text-right px-4 py-2 font-medium">价格</th>
                <th className="text-right px-4 py-2 font-medium">数量</th>
                <th className="text-right px-4 py-2 font-medium">剩余</th>
                <th className="text-left px-4 py-2 font-medium">状态</th>
                <th className="text-center px-4 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.orderId} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-foreground">{order.marketSymbol}</td>
                  <td className="px-4 py-2.5">
                    <span className={order.side === "buy" ? "text-buy font-medium" : "text-sell font-medium"}>
                      {order.side === "buy" ? "买入" : "卖出"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{ORDER_TYPE_LABELS[order.orderType] || order.orderType}</td>
                  <td className="px-4 py-2.5 text-right num text-foreground">
                    {parseFloat(order.price) > 0 ? parseFloat(order.price).toFixed(2) : "市价"}
                    {order.triggerPrice && <span className="text-muted-foreground ml-1">触: {parseFloat(order.triggerPrice).toFixed(2)}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right num text-foreground">{order.size}</td>
                  <td className="px-4 py-2.5 text-right num text-muted-foreground">{order.remainingSize}</td>
                  <td className="px-4 py-2.5">
                    <Badge className={`text-xs h-5 ${STATUS_LABELS[order.status]?.className || ""}`}>
                      {STATUS_LABELS[order.status]?.label || order.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => cancelMutation.mutate({ accountId, marketId: order.marketId, orderId: order.orderId })}
                      disabled={cancelMutation.isPending}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrderHistoryTab({ accountId }: { accountId: number }) {
  const query = trpc.history.orderHistory.useQuery(
    { accountId, limit: 50 },
    { staleTime: 30_000 }
  );
  const orders: Order[] = (query.data || []) as Order[];

  if (query.isLoading) return <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>;
  if (query.error) return (
    <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
      <AlertCircle className="h-8 w-8 text-destructive/60" />
      <p className="text-destructive/80">认证失败：请检查您的 API Key 和私钥是否正确</p>
    </div>
  );

  return (
    <div>
      {orders.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">暂无历史订单</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">市场</th>
                <th className="text-left px-4 py-2 font-medium">方向</th>
                <th className="text-left px-4 py-2 font-medium">类型</th>
                <th className="text-right px-4 py-2 font-medium">价格</th>
                <th className="text-right px-4 py-2 font-medium">数量</th>
                <th className="text-left px-4 py-2 font-medium">状态</th>
                <th className="text-right px-4 py-2 font-medium">时间</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.orderId} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-foreground">{order.marketSymbol}</td>
                  <td className="px-4 py-2.5">
                    <span className={order.side === "buy" ? "text-buy font-medium" : "text-sell font-medium"}>
                      {order.side === "buy" ? "买入" : "卖出"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{ORDER_TYPE_LABELS[order.orderType] || order.orderType}</td>
                  <td className="px-4 py-2.5 text-right num text-foreground">
                    {parseFloat(order.price) > 0 ? parseFloat(order.price).toFixed(2) : "市价"}
                  </td>
                  <td className="px-4 py-2.5 text-right num text-foreground">{order.size}</td>
                  <td className="px-4 py-2.5">
                    <Badge className={`text-xs h-5 ${STATUS_LABELS[order.status]?.className || ""}`}>
                      {STATUS_LABELS[order.status]?.label || order.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {new Date(order.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TradeHistoryTab({ accountId }: { accountId: number }) {
  const query = trpc.history.tradeHistory.useQuery(
    { accountId, limit: 50 },
    { staleTime: 30_000 }
  );
  const trades: Trade[] = (query.data || []) as Trade[];

  if (query.isLoading) return <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>;
  if (query.error) return (
    <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
      <AlertCircle className="h-8 w-8 text-destructive/60" />
      <p className="text-destructive/80">认证失败：请检查您的 API Key 和私钥是否正确</p>
    </div>
  );

  return (
    <div>
      {trades.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">暂无交易记录</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">市场</th>
                <th className="text-left px-4 py-2 font-medium">方向</th>
                <th className="text-right px-4 py-2 font-medium">成交价</th>
                <th className="text-right px-4 py-2 font-medium">数量</th>
                <th className="text-right px-4 py-2 font-medium">成交金额</th>
                <th className="text-right px-4 py-2 font-medium">盈亏</th>
                <th className="text-right px-4 py-2 font-medium">手续费</th>
                <th className="text-left px-4 py-2 font-medium">角色</th>
                <th className="text-right px-4 py-2 font-medium">时间</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(trade => {
                const pnl = trade.realizedPnl != null ? parseFloat(trade.realizedPnl) : null;
                const quoteAmt = trade.quoteAmount ? parseFloat(trade.quoteAmount) : null;
                return (
                <tr key={trade.tradeId} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-foreground">{trade.marketSymbol}</td>
                  <td className="px-4 py-2.5">
                    <span className={trade.side === "buy" ? "text-buy font-medium" : "text-sell font-medium"}>
                      {trade.side === "buy" ? "买入" : "卖出"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right num text-foreground">{parseFloat(trade.price).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right num text-foreground">{trade.size}</td>
                  <td className="px-4 py-2.5 text-right num text-muted-foreground">
                    {quoteAmt != null ? `$${quoteAmt.toFixed(2)}` : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right num">
                    {pnl != null ? (
                      <span className={pnl >= 0 ? "text-buy font-medium" : "text-sell font-medium"}>
                        {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right num text-muted-foreground">{trade.fee} {trade.feeAsset}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className="text-xs h-5 border-border text-muted-foreground">
                      {trade.role === "maker" ? "挂单方" : "吃单方"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {new Date(trade.timestamp).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  const params = useParams<{ accountId?: string }>();
  const [, setLocation] = useLocation();
  const [selectedAccountId, setSelectedAccountId] = useState(params.accountId || "");

  const accountId = selectedAccountId ? parseInt(selectedAccountId) : null;

  useEffect(() => {
    if (params.accountId) setSelectedAccountId(params.accountId);
  }, [params.accountId]);

  const exchangesQuery = trpc.exchange.list.useQuery(undefined, { staleTime: 60_000 });
  const hasAccounts = (exchangesQuery.data?.length || 0) > 0;

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

  return (
    <div className="p-4 space-y-4 max-w-7xl">
      <div className="flex items-center gap-3">
        <History className="h-4 w-4 text-primary" />
        <h1 className="text-base font-bold text-foreground">历史记录</h1>
        <AccountSelector value={selectedAccountId} onChange={setSelectedAccountId} />
      </div>

      {!accountId ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <History className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">请先选择交易账户</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border">
          <Tabs defaultValue="active">
            <div className="border-b border-border px-4">
              <TabsList className="bg-transparent h-10 gap-1 p-0">
                <TabsTrigger value="active" className="text-xs h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground bg-transparent px-3">
                  当前委托
                </TabsTrigger>
                <TabsTrigger value="orders" className="text-xs h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground bg-transparent px-3">
                  历史订单
                </TabsTrigger>
                <TabsTrigger value="trades" className="text-xs h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground bg-transparent px-3">
                  成交明细
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="active" className="m-0">
              <ActiveOrdersTab accountId={accountId} />
            </TabsContent>
            <TabsContent value="orders" className="m-0">
              <OrderHistoryTab accountId={accountId} />
            </TabsContent>
            <TabsContent value="trades" className="m-0">
              <TradeHistoryTab accountId={accountId} />
            </TabsContent>
          </Tabs>
        </Card>
      )}
    </div>
  );
}
