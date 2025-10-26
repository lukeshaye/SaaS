// apps/backend-api/src/domains/clients/index.ts
// Este arquivo monta a instância do Hono app para este domínio
// e a exporta para ser consumida pelo /src/index.ts principal.

import { clientsController } from './client.controller';

export { clientsController };
