// apps/backend-api/src/domains/clients/client.service.ts
// PILAR 2 (Service): Contém a lógica de negócios e autorização (RBAC).
// Não conhece HTTP. Recebe o Repository por injeção.

import { z } from 'zod';
import { CreateClientSchema } from '@saas/shared-types';
import { ClientRepository } from './client.repository';

// Define o DTO (Data Transfer Object) a partir do schema Zod
type CreateClientDTO = z.infer<typeof CreateClientSchema>;

export class ClientService {
  private repository: ClientRepository;

  constructor(repository: ClientRepository) {
    this.repository = repository;
  }

  // --- Lógica de Negócios ---

  async getAll(tenantId: string, role: string) {
    // PILAR 14 (RBAC): Exemplo de verificação de permissão
    // Neste caso, qualquer role pode ler clientes.
    if (role !== 'owner' && role !== 'admin' && role !== 'staff') {
        throw new Error('Unauthorized: Role desconhecido não pode ver clientes');
    }

    // VIOLAÇÃO (Pilar 13) CORRIGIDA: Passa o tenantId para o repositório
    const clients = await this.repository.findAll(tenantId);
    // @ts-ignore
    return clients.results || []; // Ajusta para o formato de D1 `all()`
  }

  async create(tenantId: string, role: string, data: CreateClientDTO) {
    // PILAR 14 (RBAC): Apenas admin ou owner podem criar
    if (role !== 'owner' && role !== 'admin') {
      throw new Error('Unauthorized: Apenas admins ou superiores podem criar clientes');
    }

    // Lógica de negócios (ex: formatação, etc.)
    const dataToCreate = {
      ...data,
      birth_date: data.birth_date ? new Date(data.birth_date).toISOString().split('T')[0] : null,
    };

    const result = await this.repository.create(tenantId, dataToCreate);
    
    // @ts-ignore
    const newClientId = result.meta.last_row_id;
    if (!newClientId) {
      throw new Error('Falha ao criar cliente no banco de dados');
    }
    
    const newClient = await this.repository.findById(tenantId, newClientId.toString());
    return newClient;
  }

  async update(tenantId: string, role: string, id: string, data: CreateClientDTO) {
    // PILAR 14 (RBAC): Apenas admin ou owner podem atualizar
    if (role !== 'owner' && role !== 'admin') {
      throw new Error('Unauthorized: Apenas admins ou superiores podem atualizar clientes');
    }

    const dataToUpdate = {
      ...data,
      birth_date: data.birth_date ? new Date(data.birth_date).toISOString().split('T')[0] : null,
    };
    
    await this.repository.update(tenantId, id, dataToUpdate);
    
    const updatedClient = await this.repository.findById(tenantId, id);
    return updatedClient;
  }

  async delete(tenantId: string, role: string, id: string) {
    // PILAR 14 (RBAC): Apenas o owner pode deletar (exemplo de regra mais estrita)
    if (role !== 'owner') {
      throw new Error('Unauthorized: Apenas o proprietário pode deletar clientes');
    }

    // Verifica se o cliente existe antes de deletar
    const existing = await this.repository.findById(tenantId, id);
    if (!existing) {
      throw new Error('Cliente não encontrado');
    }

    await this.repository.delete(tenantId, id);
    return { success: true };
  }
}
