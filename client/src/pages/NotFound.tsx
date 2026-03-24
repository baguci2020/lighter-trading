import { Button } from "@/components/ui/button";
import { BarChart2, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center space-y-6 p-8">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <BarChart2 className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-foreground num">404</h1>
          <h2 className="text-xl font-semibold text-foreground">页面不存在</h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            抱歉，您访问的页面不存在或已被移除，请返回首页继续操作。
          </p>
        </div>
        <Button onClick={() => setLocation("/")} className="gap-2">
          <Home className="h-4 w-4" />
          返回首页
        </Button>
      </div>
    </div>
  );
}
