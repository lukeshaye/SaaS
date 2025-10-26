// apps/backend-api/src/domains/clients/client.controller.ts
// PILAR 2 (Controller): Define as rotas HTTP, valida a entrada (zValidator)
// e delega a lógica para o Service.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

// VIOLAÇÃO (Pilar 6) CORRIGIDA: Importa schema do pacote compartilhado
import { CreateClientSchema } from '@saas/shared-types';

import { ClientService } from './client.service';
import { ClientRepository } from './client.repository';

// Define os tipos de ambiente esperados pelo Hono
type Env = {
  Bindings: {
    DB: any; // Instância do DB (ex: D1Database)
  };
  Variables: {
    tenantId: string;
    role: string;
  }
};

const clientsController = new Hono<Env>();

// Injeção de dependência "per-request"
// O Controller é a única camada que conhece o Contexto 'c'
const getService = (c: any) => {
  const db = c.env.DB; 
  // TODO: Substituir 'c.env.DB' pela instância Kysely/Drizzle
  // que pode ser injetada via middleware (ex: c.set('db', ...))
  
  const repository = new ClientRepository(db);
  const service = new ClientService(repository);
  return service;
};

// GET /api/clients
clientsController.get('/', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const role = c.get('role');

    // VIOLAÇÃO (Pilar 13) CORRIGIDA: Validação de contexto
    if (!tenantId || !role) {
      return c.json({ error: 'Contexto de autenticação inválido' }, 401);
    }

    const service = getService(c);
    const clients = await service.getAll(tenantId, role);
    
    return c.json(clients);
  } catch (error: any) {
    return c.json({ error: 'Falha ao buscar clientes', details: error.message }, 500);
  }
});

// POST /api/clients
clientsController.post('/', zValidator('json', CreateClientSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const role = c.get('role');

    if (!tenantId || !role) {
      return c.json({ error: 'Contexto de autenticação inválido' }, 401);
    }
    
    const validatedData = c.req.valid('json');
    const service = getService(c);
    
    // VIOLAÇÃO (Pilar 14) CORRIGIDA: A lógica de autorização está no service
    const newClient = await service.create(tenantId, role, validatedData);
    
    return c.json(newClient, 201);
  } catch (error: any) {
    if (error.message.includes('Unauthorized')) {
      return c.json({ error: error.message }, 403); // Forbidden
    }
    return c.json({ error: 'Falha ao criar cliente', details: error.message }, 500);
  }
});

// PUT /api/clients/:id
clientsController.put('/:id', zValidator('json', CreateClientSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const role = c.get('role');
    const clientId = c.req.param('id');

    if (!tenantId || !role) {
      return c.json({ error: 'Contexto de autenticação inválido' }, 401);
    }

    const validatedData = c.req.valid('json');
    const service = getService(c);
    
    const updatedClient = await service.update(tenantId, role, clientId, validatedData);
    
    if (!updatedClient) {
      return c.json({ error: 'Cliente não encontrado ou não permitido' }, 404);
    }
    
    return c.json(updatedClient);
  } catch (error: any) {
    if (error.message.includes('Unauthorized')) {
      return c.json({ error: error.message }, 403);
    }
    return c.json({ error: 'Falha ao atualizar cliente', details: error.message }, 500);
  }
});

// DELETE /api/clients/:id
clientsController.delete('/:id', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const role = c.get('role');
    const clientId = c.req.param('id');

    if (!tenantId || !role) {
      return c.json({ error: 'Contexto de autenticação inválido' }, 401);
    }

    const service = getService(c);
    await service.delete(tenantId, role, clientId);
    
    return c.json({ success: true });
  } catch (error: any) {
    if (error.message.includes('Unauthorized')) {
      return c.json({ error: error.message }, 403);
    }
    return c.json({ error: 'Falha ao deletar cliente', details: error.message }, 500);
  }
});

export { clientsController };
