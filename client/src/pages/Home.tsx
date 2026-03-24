import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart2, TrendingUp, TrendingDown, Wallet, AlertCircle, Plus, Zap, ChevronRight } from "lucide-react";

function StatCard({ title, value, sub, positive }: { title: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-5 pb-4 px-5">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className={`text-xl font-bold num ${positive === true ? "text-buy" : positive === false ? "text-sell" : "text-foreground"}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function AccountCard({ account, onTrade }: { account: { id: number; label: string; exchangeType: string }; onTrade: () => void }) {
  const [, setLocation] = useLocation();
  const balanceQuery = trpc.account.balance.useQuery({ accountId: account.id }, {
    retry: false,
    staleTime: 30_000,
  });

  const balance = balanceQuery.data;
  const pnlPositive = balance ? parseFloat(balance.unrealizedPnl) >= 0 : null;

  return (
    <Card className="bg-card border-border hover:border-primary/40 transition-colors">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
              <BarChart2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">{account.label}</CardTitle>
              <p className="text-xs text-muted-foreground capitalize">{account.exchangeType}</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs border-primary/30 text-primary">
            已连接
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        {balanceQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : balanceQuery.isError ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span>无法获取余额</span>
          </div>
        ) : balance ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">总资产</p>
              <p className="text-2xl font-bold num text-foreground">${parseFloat(balance.totalValue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">可用余额</p>
                <p className="num text-foreground font-medium">${parseFloat(balance.availableBalance).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">已用保证金</p>
                <p className="num text-foreground font-medium">${parseFloat(balance.usedMargin).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">未实现盈亏</p>
                <p className={`num font-medium ${pnlPositive ? "text-buy" : "text-sell"}`}>
                  {pnlPositive ? "+" : ""}{parseFloat(balance.unrealizedPnl).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex gap-2 mt-4">
          <Button size="sm" className="flex-1 h-8 text-xs" onClick={onTrade}>
            <Zap className="h-3 w-3 mr-1" /> 去交易
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setLocation(`/history/${account.id}`)}>
            历史记录
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const exchangesQuery = trpc.exchange.list.useQuery(undefined, { staleTime: 60_000 });
  const accounts = exchangesQuery.data || [];

  const totalStats = useMemo(() => {
    return { accounts: accounts.length };
  }, [accounts]);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            你好，{user?.name || "Trader"} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            管理您的去中心化交易所账户
          </p>
        </div>
        <Button size="sm" onClick={() => setLocation("/exchanges")}>
          <Plus className="h-4 w-4 mr-1" /> 添加交易所
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="已连接交易所" value={String(totalStats.accounts)} sub="个账户" />
        <StatCard title="平台" value="Lighter.xyz" sub="去中心化永续合约" />
        <StatCard title="支持订单类型" value="3 种" sub="市价 / 限价 / 止盈止损" />
        <StatCard title="数据安全" value="AES-256" sub="端到端加密存储" />
      </div>

      {/* Accounts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">交易所账户</h2>
          {accounts.length > 0 && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={() => setLocation("/exchanges")}>
              管理 <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>

        {exchangesQuery.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2].map(i => <Skeleton key={i} className="h-48 rounded-lg" />)}
          </div>
        ) : accounts.length === 0 ? (
          <Card className="bg-card border-border border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <BarChart2 className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">尚未添加交易所</p>
                <p className="text-xs text-muted-foreground mt-1">添加您的 Lighter.xyz API Key 开始交易</p>
              </div>
              <Button size="sm" onClick={() => setLocation("/exchanges")}>
                <Plus className="h-4 w-4 mr-1" /> 添加交易所
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                onTrade={() => setLocation(`/trading/${account.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      {accounts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">快速操作</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "开始交易", icon: Zap, path: "/trading", color: "text-primary" },
              { label: "查看持仓", icon: TrendingUp, path: "/trading", color: "text-buy" },
              { label: "历史记录", icon: BarChart2, path: "/history", color: "text-neutral-400" },
              { label: "管理账户", icon: TrendingDown, path: "/exchanges", color: "text-sell" },
            ].map(action => (
              <Card
                key={action.label}
                className="bg-card border-border hover:border-primary/40 cursor-pointer transition-colors"
                onClick={() => setLocation(action.path)}
              >
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  <action.icon className={`h-5 w-5 ${action.color}`} />
                  <span className="text-sm font-medium text-foreground">{action.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
