import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Trash2, BarChart2, Eye, EyeOff, Info, ShieldCheck, Loader2, CheckCircle2, XCircle } from "lucide-react";

type ExchangeAccount = {
  id: number;
  label: string;
  exchangeType: string;
  accountIndex: string | null;
  apiKeyIndex: string | null;
  l1Address: string | null;
  isActive: boolean;
  createdAt: Date;
};

function AddAccountDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    label: "",
    apiKeyIndex: "",
    l1Address: "",
    privateKey: "",
  });
  const [showKey, setShowKey] = useState(false);
  // Auto-lookup state
  const [lookupEnabled, setLookupEnabled] = useState(false);
  const [resolvedAccountIndex, setResolvedAccountIndex] = useState<string | null>(null);
  const utils = trpc.useUtils();

  // Debounce: trigger lookup 800ms after user stops typing l1Address
  useEffect(() => {
    setResolvedAccountIndex(null);
    setLookupEnabled(false);
    if (!form.l1Address.trim() || !/^0x[0-9a-fA-F]{40}$/.test(form.l1Address.trim())) return;
    const timer = setTimeout(() => setLookupEnabled(true), 800);
    return () => clearTimeout(timer);
  }, [form.l1Address]);

  const lookupQuery = trpc.exchange.lookupByL1Address.useQuery(
    { l1Address: form.l1Address.trim() },
    {
      enabled: lookupEnabled,
      retry: false,
      staleTime: 60_000,
    }
  );

  // Update resolvedAccountIndex when lookup succeeds
  useEffect(() => {
    if (lookupQuery.data) {
      setResolvedAccountIndex(lookupQuery.data.accountIndex);
    } else if (lookupQuery.isError) {
      setResolvedAccountIndex(null);
    }
  }, [lookupQuery.data, lookupQuery.isError]);

  const createMutation = trpc.exchange.create.useMutation({
    onSuccess: () => {
      toast.success("交易所账户已添加");
      utils.exchange.list.invalidate();
      onSuccess();
      onClose();
      setForm({ label: "", apiKeyIndex: "", l1Address: "", privateKey: "" });
      setResolvedAccountIndex(null);
      setLookupEnabled(false);
    },
    onError: (err) => toast.error(`添加失败: ${err.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label.trim()) return toast.error("请输入账户标签");
    if (!form.l1Address.trim()) return toast.error("请输入 L1 以太坊地址");
    if (!resolvedAccountIndex) return toast.error("账户索引查询中，请稍候");
    if (!form.apiKeyIndex.trim()) return toast.error("请输入 API Key 索引");
    if (!form.privateKey.trim()) return toast.error("请输入私钥");
    const cleanKey = form.privateKey.trim().replace(/^0x/, '');
    if (cleanKey.length !== 80) return toast.error(`私钥长度错误：需要 80 位十六进制，当前 ${cleanKey.length} 位`);
    createMutation.mutate({
      exchangeType: "lighter",
      label: form.label,
      accountIndex: resolvedAccountIndex,
      apiKeyIndex: form.apiKeyIndex,
      l1Address: form.l1Address.trim(),
      privateKey: cleanKey,
    });
  };

  const isLookingUp = lookupEnabled && lookupQuery.isLoading;
  const lookupError = lookupQuery.isError ? (lookupQuery.error?.message || "未找到账户") : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-primary" />
            添加 Lighter.xyz 账户
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            您的私钥将使用 AES-256-GCM 加密存储，前端不会接触明文私钥。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 账户标签 */}
          <div className="space-y-1.5">
            <Label htmlFor="label" className="text-sm text-foreground">账户标签 *</Label>
            <Input
              id="label"
              placeholder="例如：主账户"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              className="bg-input border-border text-foreground"
            />
          </div>

          {/* L1 地址 + 自动查询账户索引 */}
          <div className="space-y-1.5">
            <Label htmlFor="l1Address" className="text-sm text-foreground">
              L1 以太坊地址 *
            </Label>
            <div className="relative">
              <Input
                id="l1Address"
                placeholder="0x..."
                value={form.l1Address}
                onChange={e => setForm(f => ({ ...f, l1Address: e.target.value }))}
                className="bg-input border-border text-foreground font-mono text-xs pr-8"
              />
              {/* 状态图标 */}
              {isLookingUp && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
              )}
              {!isLookingUp && resolvedAccountIndex && (
                <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-buy" />
              )}
              {!isLookingUp && lookupError && (
                <XCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
              )}
            </div>
            {/* 查询结果提示 */}
            {isLookingUp && (
              <p className="text-xs text-muted-foreground">正在从 Lighter.xyz 查询账户索引...</p>
            )}
            {!isLookingUp && resolvedAccountIndex && (
              <p className="text-xs text-buy flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                已找到账户，索引：<span className="font-mono font-semibold">{resolvedAccountIndex}</span>
              </p>
            )}
            {!isLookingUp && lookupError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                {lookupError}
              </p>
            )}
          </div>

          {/* API Key 索引 */}
          <div className="space-y-1.5">
            <Label htmlFor="apiKeyIndex" className="text-sm text-foreground">API Key 索引 *</Label>
            <Input
              id="apiKeyIndex"
              placeholder="例如：4"
              value={form.apiKeyIndex}
              onChange={e => setForm(f => ({ ...f, apiKeyIndex: e.target.value }))}
              className="bg-input border-border text-foreground"
            />
          </div>

          {/* 私钥 */}
          <div className="space-y-1.5">
            <Label htmlFor="privateKey" className="text-sm text-foreground flex items-center gap-1">
              API 私钥 *
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            </Label>
            <div className="relative">
              <Input
                id="privateKey"
                type={showKey ? "text" : "password"}
                placeholder="输入您的 Lighter API 私钥"
                value={form.privateKey}
                onChange={e => setForm(f => ({ ...f, privateKey: e.target.value }))}
                className="bg-input border-border text-foreground font-mono text-xs pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              私钥为 80 位十六进制字符串（40 字节），仅用于服务端签名，加密后存储
            </p>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">取消</Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={createMutation.isPending || isLookingUp || (!resolvedAccountIndex && !!form.l1Address.trim())}
            >
              {createMutation.isPending ? "添加中..." : "确认添加"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ExchangesPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const listQuery = trpc.exchange.list.useQuery(undefined, { staleTime: 30_000 });
  const accounts: ExchangeAccount[] = (listQuery.data || []) as ExchangeAccount[];

  const deleteMutation = trpc.exchange.delete.useMutation({
    onSuccess: () => {
      toast.success("账户已删除");
      utils.exchange.list.invalidate();
      setDeleteId(null);
    },
    onError: (err) => toast.error(`删除失败: ${err.message}`),
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">交易所管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">管理您的 Lighter.xyz API Key 配置</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> 添加账户
        </Button>
      </div>

      {/* Security Notice */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="flex items-start gap-3 py-3 px-4">
          <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">安全存储保障</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              所有 API Key 和私钥均使用 AES-256-GCM 加密存储。后端代理所有交易签名操作，您的私钥明文永远不会出现在前端或网络传输中。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Account List */}
      {listQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : accounts.length === 0 ? (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <BarChart2 className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">暂无交易所账户</p>
              <p className="text-xs text-muted-foreground mt-1">点击「添加账户」连接您的 Lighter.xyz 账户</p>
            </div>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1" /> 添加账户
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map(account => (
            <Card key={account.id} className="bg-card border-border">
              <CardContent className="flex items-center justify-between py-4 px-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <BarChart2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{account.label}</p>
                      <Badge variant="outline" className="text-xs border-primary/30 text-primary h-5">
                        {account.exchangeType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {account.accountIndex && <span>账户索引: <span className="num">{account.accountIndex}</span></span>}
                      {account.apiKeyIndex && <span>Key 索引: <span className="num">{account.apiKeyIndex}</span></span>}
                      {account.l1Address && <span className="font-mono">{account.l1Address.slice(0, 8)}...{account.l1Address.slice(-6)}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-buy/10 text-buy border-buy/20 text-xs">已连接</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(account.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddAccountDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={() => {}}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">确认删除账户？</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              此操作将删除该交易所账户配置，包括加密存储的 API Key。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary text-foreground border-border">取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              {deleteMutation.isPending ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
