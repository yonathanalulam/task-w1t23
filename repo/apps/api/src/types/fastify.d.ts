import 'fastify';
import type { Pool } from 'pg';
import type { AppConfig } from '../lib/config.js';
import type { AuthService, AuthContext } from '../modules/auth/service.js';
import type { AuditWriteInput } from '../modules/audit/types.js';
import type { createResearcherRepository } from '../modules/researcher/repository.js';
import type { createResearcherService } from '../modules/researcher/service.js';
import type { createWorkflowRepository } from '../modules/workflow/repository.js';
import type { createWorkflowService } from '../modules/workflow/service.js';
import type { createJournalGovernanceRepository } from '../modules/journals/repository.js';
import type { createJournalGovernanceService } from '../modules/journals/service.js';
import type { createResourceBookingRepository } from '../modules/resource-booking/repository.js';
import type { createResourceBookingService } from '../modules/resource-booking/service.js';
import type { createRecommendationsRepository } from '../modules/recommendations/repository.js';
import type { createRecommendationsService } from '../modules/recommendations/service.js';
import type { createFinanceRepository } from '../modules/finance/repository.js';
import type { createFinanceService } from '../modules/finance/service.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    dbPool: Pool;
    authService: AuthService;
    researcherRepository: ReturnType<typeof createResearcherRepository>;
    researcherService: ReturnType<typeof createResearcherService>;
    workflowRepository: ReturnType<typeof createWorkflowRepository>;
    workflowService: ReturnType<typeof createWorkflowService>;
    journalGovernanceRepository: ReturnType<typeof createJournalGovernanceRepository>;
    journalGovernanceService: ReturnType<typeof createJournalGovernanceService>;
    resourceBookingRepository: ReturnType<typeof createResourceBookingRepository>;
    resourceBookingService: ReturnType<typeof createResourceBookingService>;
    recommendationsRepository: ReturnType<typeof createRecommendationsRepository>;
    recommendationsService: ReturnType<typeof createRecommendationsService>;
    financeRepository: ReturnType<typeof createFinanceRepository>;
    financeService: ReturnType<typeof createFinanceService>;
    audit: {
      write: (input: AuditWriteInput) => Promise<void>;
    };
  }

  interface FastifyRequest {
    auth: AuthContext | null;
  }
}
