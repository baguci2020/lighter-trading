import { z } from "zod";
import { TRPCError } from "@trpc/server";
import axios from "axios";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { encrypt } from "./crypto";
import {
  getExchangeAccountsByUserId,
  getExchangeAccountById,
  createExchangeAccount,
  updateExchangeAccount,
  deleteExchangeAccount,
  getUserByUsername,
  createLocalUser,
  updateUserLastSignedIn,
} from "./db";
import { createExchangeService } from "./exchange/factory";
import { hashPassword, verifyPassword, createLocalSessionToken } from "./localAuth";

const LIGHTER_BASE_URL = "https://mainnet.zklighter.elliot.ai";

// ─── Exchange Accounts Router ─────────────────────────────────────────────

const exchangeRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await getExchangeAccountsByUserId(ctx.user.id);
    // Strip encrypted fields from response
    return accounts.map(({ encryptedApiKey, encryptedPrivateKey, ...safe }) => safe);
  }),

  create: protectedProcedure
    .input(z.object({
      exchangeType: z.string().default("lighter"),
      label: z.string().min(1).max(128),
      accountIndex: z.string().optional(),
      apiKeyIndex: z.string().optional(),
      l1Address: z.string().optional(),
      apiKey: z.string().optional(),       // plain text, will be encrypted
      privateKey: z.string().min(1),       // plain text, will be encrypted
    }))
    .mutation(async ({ ctx, input }) => {
      const encryptedPrivateKey = encrypt(input.privateKey);
      const encryptedApiKey = input.apiKey ? encrypt(input.apiKey) : null;

      const id = await createExchangeAccount({
        userId: ctx.user.id,
        exchangeType: input.exchangeType,
        label: input.label,
        accountIndex: input.accountIndex || null,
        apiKeyIndex: input.apiKeyIndex || null,
        l1Address: input.l1Address || null,
        encryptedApiKey,
        encryptedPrivateKey,
        isActive: true,
      });
      return { id, success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      label: z.string().min(1).max(128).optional(),
      accountIndex: z.string().optional(),
      apiKeyIndex: z.string().optional(),
      l1Address: z.string().optional(),
      privateKey: z.string().optional(),
      apiKey: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, privateKey, apiKey, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest };
      if (privateKey) updateData.encryptedPrivateKey = encrypt(privateKey);
      if (apiKey) updateData.encryptedApiKey = encrypt(apiKey);
      await updateExchangeAccount(id, ctx.user.id, updateData);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteExchangeAccount(input.id, ctx.user.id);
      return { success: true };
    }),

  // Look up account index by L1 Ethereum address from Lighter.xyz
  lookupByL1Address: protectedProcedure
    .input(z.object({ l1Address: z.string().min(1) }))
    .query(async ({ input }) => {
      try {
        const resp = await axios.get(`${LIGHTER_BASE_URL}/api/v1/account`, {
          params: { by: "l1_address", value: input.l1Address },
          timeout: 10000,
          headers: { accept: "application/json" },
        });
        const accounts = resp.data?.accounts;
        if (!accounts || accounts.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "未找到该 L1 地址对应的 Lighter 账户" });
        }
        const acc = accounts[0];
        return {
          accountIndex: String(acc.account_index ?? acc.index),
          l1Address: acc.l1_address as string,
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "NOT_FOUND", message: `查询失败：${msg}` });
      }
    }),
});

// ─── Account / Balance Router ─────────────────────────────────────────────

const accountRouter = router({
  balance: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .query(async ({ ctx, input }) => {
      const account = await getExchangeAccountById(input.accountId, ctx.user.id);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Exchange account not found" });
      const service = createExchangeService(account);
      return service.getBalance();
    }),

  positions: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .query(async ({ ctx, input }) => {
      const account = await getExchangeAccountById(input.accountId, ctx.user.id);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Exchange account not found" });
      const service = createExchangeService(account);
      return service.getPositions();
    }),

  markets: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .query(async ({ ctx, input }) => {
      const account = await getExchangeAccountById(input.accountId, ctx.user.id);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Exchange account not found" });
      const service = createExchangeService(account);
      return service.getMarkets();
    }),

  orderBook: protectedProcedure
    .input(z.object({ accountId: z.number(), marketId: z.number() }))
    .query(async ({ ctx, input }) => {
      const account = await getExchangeAccountById(input.accountId, ctx.user.id);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Exchange account not found" });
      const service = createExchangeService(account);
      return service.getOrderBook(input.marketId);
    }),
});

// ─── Trading Router ───────────────────────────────────────────────────────

const tradingRouter = router({
  createOrder: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      marketId: z.number(),
      side: z.enum(["buy", "sell"]),
      orderType: z.enum(["market", "limit", "stop_loss", "take_profit", "stop_loss_limit", "take_profit_limit"]),
      size: z.string(),
      price: z.string().optional(),
      triggerPrice: z.string().optional(),
      timeInForce: z.enum(["gtc", "ioc", "fok", "gtt"]).optional(),
      reduceOnly: z.boolean().optional(),
      postOnly: z.boolean().optional(),
      expiry: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const account = await getExchangeAccountById(input.accountId, ctx.user.id);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Exchange account not found" });
      const service = createExchangeService(account);
      const { accountId, ...params } = input;
      return service.createOrder(params);
    }),

  cancelOrder: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      marketId: z.number(),
      orderId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const account = await getExchangeAccountById(input.accountId, ctx.user.id);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Exchange account not found" });
      const service = createExchangeService(account);
      return service.cancelOrder({ marketId: input.marketId, orderId: input.orderId });
    }),

  cancelAllOrders: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      marketId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const account = await getExchangeAccountById(input.accountId, ctx.user.id);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Exchange account not found" });
      const service = createExchangeService(account);
      const count = await service.cancelAllOrders(input.marketId);
      return { cancelled: count };
    }),
});

// ─── History Router ───────────────────────────────────────────────────────

const historyRouter = router({
  activeOrders: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      marketId: z.number().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const account = await getExchangeAccountById(input.accountId, ctx.user.id);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Exchange account not found" });
      const service = createExchangeService(account);
      return service.getActiveOrders({ marketId: input.marketId, limit: input.limit });
    }),

  orderHistory: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      marketId: z.number().optional(),
      limit: z.number().optional(),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const account = await getExchangeAccountById(input.accountId, ctx.user.id);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Exchange account not found" });
      const service = createExchangeService(account);
      return service.getOrderHistory({ marketId: input.marketId, limit: input.limit, cursor: input.cursor });
    }),

  tradeHistory: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      marketId: z.number().optional(),
      limit: z.number().optional(),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const account = await getExchangeAccountById(input.accountId, ctx.user.id);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Exchange account not found" });
      const service = createExchangeService(account);
      return service.getTradeHistory({ marketId: input.marketId, limit: input.limit, cursor: input.cursor });
    }),
});

// ─── App Router ───────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    login: publicProcedure
      .input(z.object({
        username: z.string().min(1).max(64),
        password: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await getUserByUsername(input.username);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "用户名或密码错误" });
        }
        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "用户名或密码错误" });
        }
        await updateUserLastSignedIn(user.id);
        const token = await createLocalSessionToken(user.id, user.username!);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 * 1000 });
        const { passwordHash, ...safeUser } = user;
        return { success: true, user: safeUser };
      }),

    register: publicProcedure
      .input(z.object({
        username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线"),
        password: z.string().min(6, "密码至少 6 位"),
        name: z.string().min(1).max(64).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const existing = await getUserByUsername(input.username);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "用户名已被占用" });
        }
        const passwordHash = await hashPassword(input.password);
        const displayName = input.name || input.username;
        const userId = await createLocalUser(input.username, passwordHash, displayName);
        const token = await createLocalSessionToken(userId, input.username);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 * 1000 });
        return { success: true, userId };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  exchange: exchangeRouter,
  account: accountRouter,
  trading: tradingRouter,
  history: historyRouter,
});

export type AppRouter = typeof appRouter;
