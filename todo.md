# Lighter Trading Platform - TODO

## Phase 1: 数据库 Schema 与后端基础架构
- [x] 设计 exchanges 表（存储交易所配置）
- [x] 设计 exchange_accounts 表（存储加密的 API Key）
- [x] 实现 AES-256-GCM 加密/解密工具
- [x] 实现 ExchangeService 统一接口
- [x] 实现 LighterAdapter（账户查询、下单、历史记录）
- [x] 执行数据库迁移 SQL

## Phase 2: 后端 tRPC 路由
- [x] exchange 路由（CRUD 交易所账户）
- [x] account 路由（查询余额、持仓）
- [x] trading 路由（市价单、限价单、止盈止损单、撤单）
- [x] history 路由（活跃订单、历史订单、交易明细）
- [x] orderbook 路由（获取市场信息）

## Phase 3: 前端全局样式与布局
- [x] 配置暗黑主题 CSS 变量（金融科技风格）
- [x] 更新 DashboardLayout（侧边栏导航）
- [x] 配置路由结构（App.tsx）
- [x] 全局字体与颜色系统（Inter + JetBrains Mono）

## Phase 4: 前端核心页面
- [x] 交易所管理页面（添加/删除 API Key，AES-256-GCM 加密存储）
- [x] 账户概览页面（总资产、持仓列表）
- [x] 交易执行面板（市价/限价/止盈止损下单）
- [x] 订单簿展示组件（实时刷新）

## Phase 5: 历史记录与 WebSocket
- [x] 历史记录页面（活跃委托、历史订单、交易明细）
- [x] 一键撤单功能
- [x] 实时价格/余额更新（轮询刷新）
- [x] 错误状态友好提示（认证失败时显示明确错误）

## Phase 6: 测试与精修
- [x] 后端单元测试（crypto 加密、exchange 路由、adapter 解析）
- [x] 所有 20 个测试通过
- [x] TypeScript 编译无错误
- [x] UI 错误状态精修（认证失败提示）
- [x] 字体引入（Google Fonts）
- [x] Checkpoint 保存

## Bug 修复（用户反馈）
- [x] 修复登录无法进入的问题（确认 OAuth 流程正确，登录需在发布后域名使用）
- [x] 全站中文化（NotFound、ManusDialog、sidebar、所有页面文本）

## Bug 修复（第二轮）
- [x] 修复登录时"未能找到授权参数"错误（state 只存 origin，sdk.ts 中拼接 /api/oauth/callback）
- [x] 修复登录时"权限错误"问题（getLoginUrl 同时传 redirectUri 和 state，确保两边一致）
- [x] 修复 /trading 页面 401 错误（无账户时优雅提示，账户不存在时显示友好错误页）
