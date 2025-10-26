// apps/backend-api/src/index.ts
// VIOLAÇÃO (Pilar 3) CORRIGIDA: Este arquivo é agora um "entry point" portável.
// Ele apenas aplica middlewares globais e "monta" os domínios.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { zValidator } from '@hono/zod-validator';
import {
  exchangeCodeForSessionToken,
  getOAuthRedirectUrl,
  authMiddleware, // Assumido como o middleware (Pilar 18) que injeta tenantId e role
  deleteSession,
  MOCHA_SESSION_TOKEN_COOKIE_NAME,
} from "@getmocha/users-service/backend";

// VIOLAÇÃO (Pilar 6) CORRIGIDA: Tipos importados do pacote centralizado.
import {
  // CreateClientSchema, // Removido daqui, pois agora é local do domínio
  AppointmentFormSchema as CreateAppointmentSchema,
  CreateFinancialEntrySchema,
  CreateProductSchema,
  CreateProfessionalSchema,
} from '@saas/shared-types';

// Importa o controller do domínio "Clients"
import { clientsController } from './domains/clients';

// --- Schemas de Validação Locais (Legado, a ser migrado) ---
// TODO: Migrar estes schemas para seus respectivos domínios.
const BusinessSettingsSchema = z.object({
  day_of_week: z.number().min(0).max(6),
  start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).nullable(),
  end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).nullable(),
});

const BusinessExceptionSchema = z.object({
  exception_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).nullable().optional(),
  end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).nullable().optional(),
  description: z.string().min(1, "Descrição é obrigatória"),
});

const AbsenceSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().optional().nullable(),
});

// --- Tipo de Ambiente (Bindings) ---
// TODO: Definir tipos de bindings adequados (ex: Kysely/Drizzle instance)
type Env = {
  Bindings: {
    DB: any; // Placeholder para a instância do D1 ou Kysely
    MOCHA_USERS_SERVICE_API_URL: string;
    MOCHA_USERS_SERVICE_API_KEY: string;
  };
  // Variáveis injetadas pelo authMiddleware (Pilar 13 e 14)
  Variables: {
    tenantId: string;
    role: string;
    user: any; // Mantido por compatibilidade com o legado
  }
};

const app = new Hono<Env>();

// --- Middlewares Globais ---
app.use("*", cors({
  origin: ["http://localhost:5173", "https://localhost:5173"],
  credentials: true,
}));

// --- Rotas de Autenticação (Pilar 18) ---
// (Mantidas no entry point por enquanto, conforme solicitado)
app.get('/api/oauth/google/redirect_url', async (c) => {
  const redirectUrl = await getOAuthRedirectUrl('google', {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
  });
  return c.json({ redirectUrl }, 200);
});

app.post("/api/sessions", async (c) => {
  const body = await c.req.json();
  if (!body.code) {
    return c.json({ error: "No authorization code provided" }, 400);
  }
  const sessionToken = await exchangeCodeForSessionToken(body.code, {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
  });
  setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, sessionToken, {
    httpOnly: true, path: "/", sameSite: "none", secure: true, maxAge: 60 * 24 * 60 * 60,
  });
  return c.json({ success: true }, 200);
});

// Este middleware (Pilar 18) agora é responsável por c.set('tenantId', ...) e c.set('role', ...)
app.get("/api/users/me", authMiddleware, async (c) => {
  return c.json(c.get("user")); // Mantido por compatibilidade
});

app.get('/api/logout', async (c) => {
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);
  if (typeof sessionToken === 'string') {
    await deleteSession(sessionToken, {
      apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
      apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
    });
  }
  setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, '', {
    httpOnly: true, path: '/', sameSite: 'none', secure: true, maxAge: 0,
  });
  return c.json({ success: true }, 200);
});


// --- Montagem de Domínios (Nova Arquitetura) ---

// VIOLAÇÃO (Pilar 2 e 3) CORRIGIDA:
// As rotas de "Clients" não estão mais aqui.
// Em vez disso, montamos o Hono app do domínio de "clients".
// O authMiddleware é aplicado aqui para proteger *todas* as rotas de clientes.
app.route('/api/clients', authMiddleware, clientsController);


// --- Rotas Legadas (A serem migradas) ---

// --- Rotas do Dashboard ---
app.get("/api/dashboard/kpis", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const today = new Date().toISOString().split('T')[0];
  const dailyEarnings = await c.env.DB.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM financial_entries WHERE user_id = ? AND type = 'receita' AND entry_date = ?`).bind(user.id, today).first();
  const dailyAppointments = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM appointments WHERE user_id = ? AND DATE(appointment_date) = ?`).bind(user.id, today).first();
  const avgTicket = await c.env.DB.prepare(`SELECT COALESCE(AVG(price), 0) as avg FROM appointments WHERE user_id = ? AND DATE(appointment_date) = ? AND attended = 1`).bind(user.id, today).first();
  return c.json({ dailyEarnings: dailyEarnings?.total || 0, dailyAppointments: dailyAppointments?.count || 0, avgTicket: avgTicket?.avg || 0 });
});

app.get("/api/dashboard/today-appointments", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const today = new Date().toISOString().split('T')[0];
  const appointments = await c.env.DB.prepare(`SELECT * FROM appointments WHERE user_id = ? AND DATE(appointment_date) = ? ORDER BY appointment_date ASC`).bind(user.id, today).all();
  return c.json(appointments.results);
});

// --- Rotas Financeiras ---
app.get("/api/financial/entries", authMiddleware, async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const entries = await c.env.DB.prepare(`SELECT * FROM financial_entries WHERE user_id = ? ORDER BY entry_date DESC LIMIT 100`).bind(user.id).all();
    return c.json(entries.results);
});

// ... (Restante das rotas legadas: Financial, Products, Professionals, Settings, Appointments) ...
// ... (O restante do arquivo index.ts legado permanece aqui temporariamente) ...

export default app;
