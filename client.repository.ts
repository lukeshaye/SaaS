// apps/backend-api/src/domains/clients/client.repository.ts
// PILAR 2 (Repository): Abstrai o acesso ao banco de dados.
// É a única camada que executa SQL (ou Kysely/Drizzle).
// VIOLAÇÃO (Pilar 13) CORRIGIDA: Exige tenantId em todas as funções.

import { z } from 'zod';
import { CreateClientSchema } from '@saas/shared-types';

type CreateClientDTO = z.infer<typeof CreateClientSchema>;
// TODO: Substituir 'any' pelo tipo do Driver (ex: D1Database, Kysely)
type Database = any; 

export class ClientRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  // VIOLAÇÃO (Pilar 2) CORRIGIDA: Lógica de SQL isolada.
  // VIOLAÇÃO (Pilar 13) CORRIGIDA: 'tenantId' (user_id) é obrigatório.
  async findAll(tenantId: string) {
    // Usando 'user_id' como coluna, mas 'tenantId' como variável (Pilar 13)
    return this.db.prepare(`
      SELECT * FROM clients 
      WHERE user_id = ? 
      ORDER BY name ASC
    `).bind(tenantId).all();
  }

  async findById(tenantId: string, id: string) {
    return this.db.prepare(`
      SELECT * FROM clients 
      WHERE id = ? AND user_id = ?
    `).bind(id, tenantId).first();
  }

  async create(tenantId: string, data: CreateClientDTO) {
    return this.db.prepare(`
      INSERT INTO clients (user_id, name, phone, email, notes, birth_date, gender)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tenantId, 
      data.name, 
      data.phone || null, 
      data.email || null, 
      data.notes || null, 
      data.birth_date, // Já formatado pelo service
      data.gender || null
    ).run();
  }

  async update(tenantId: string, id: string, data: CreateClientDTO) {
    return this.db.prepare(`
      UPDATE clients 
      SET name = ?, phone = ?, email = ?, notes = ?, birth_date = ?, gender = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      data.name, 
      data.phone || null, 
      data.email || null, 
      data.notes || null, 
      data.birth_date, // Já formatado pelo service
      data.gender || null,
      id,
      tenantId
    ).run();
  }

  async delete(tenantId: string, id: string) {
    return this.db.prepare(`
      DELETE FROM clients 
      WHERE id = ? AND user_id = ?
    `).bind(id, tenantId).run();
  }
}
