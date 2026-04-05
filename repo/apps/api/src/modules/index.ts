import type { FastifyPluginAsync } from 'fastify';
import { getPool } from '../lib/db.js';
import { writeAuditEvent } from './audit/repository.js';
import { createAuthRepository } from './auth/repository.js';
import { createAuthService } from './auth/service.js';
import { healthRoutes } from './health/routes.js';
import { authRoutes } from './auth/routes.js';
import { adminRoutes } from './admin/routes.js';
import { createResearcherRepository } from './researcher/repository.js';
import { createResearcherService } from './researcher/service.js';
import { policyRoutes } from './policies/routes.js';
import { researcherRoutes } from './researcher/routes.js';
import { createWorkflowRepository } from './workflow/repository.js';
import { createWorkflowService } from './workflow/service.js';
import { workflowRoutes } from './workflow/routes.js';
import { createJournalGovernanceRepository } from './journals/repository.js';
import { createJournalGovernanceService } from './journals/service.js';
import { journalGovernanceRoutes } from './journals/routes.js';
import { createResourceBookingRepository } from './resource-booking/repository.js';
import { createResourceBookingService } from './resource-booking/service.js';
import { resourceBookingRoutes } from './resource-booking/routes.js';
import { createRecommendationsRepository } from './recommendations/repository.js';
import { createRecommendationsService } from './recommendations/service.js';
import { recommendationsRoutes } from './recommendations/routes.js';
import { createFinanceRepository } from './finance/repository.js';
import { createFinanceService } from './finance/service.js';
import { financeRoutes } from './finance/routes.js';

export const apiModules: FastifyPluginAsync = async (app) => {
  const pool = getPool(app.config);
  const authRepository = createAuthRepository(pool);
  const researcherRepository = createResearcherRepository(pool, app.config.uploads.rootDir);
  const workflowRepository = createWorkflowRepository(pool);
  const journalGovernanceRepository = createJournalGovernanceRepository(pool, app.config.uploads.rootDir);
  const resourceBookingRepository = createResourceBookingRepository(pool);
  const recommendationsRepository = createRecommendationsRepository(pool);
  const financeRepository = createFinanceRepository(pool);

  app.decorate('dbPool', pool);
  app.decorate('researcherRepository', researcherRepository);
  app.decorate('workflowRepository', workflowRepository);
  app.decorate('journalGovernanceRepository', journalGovernanceRepository);
  app.decorate('resourceBookingRepository', resourceBookingRepository);
  app.decorate('recommendationsRepository', recommendationsRepository);
  app.decorate('financeRepository', financeRepository);

  app.decorate('audit', {
    write: async (input) => {
      await writeAuditEvent(pool, input);
    }
  });

  app.decorate(
    'authService',
    createAuthService({
      config: app.config,
      repository: authRepository,
      audit: app.audit
    })
  );

  app.decorate(
    'researcherService',
    createResearcherService({
      repository: researcherRepository,
      audit: app.audit,
      maxUploadBytes: app.config.uploads.maxBytes
    })
  );

  app.decorate(
    'workflowService',
    createWorkflowService({
      repository: workflowRepository,
      audit: app.audit
    })
  );

  app.decorate(
    'journalGovernanceService',
    createJournalGovernanceService({
      repository: journalGovernanceRepository,
      audit: app.audit,
      maxUploadBytes: app.config.uploads.maxBytes
    })
  );

  app.decorate(
    'resourceBookingService',
    createResourceBookingService({
      repository: resourceBookingRepository,
      audit: app.audit
    })
  );

  app.decorate(
    'recommendationsService',
    createRecommendationsService({
      repository: recommendationsRepository,
      audit: app.audit
    })
  );

  app.decorate(
    'financeService',
    createFinanceService({
      repository: financeRepository,
      audit: app.audit,
      encryptionKey: app.config.encryptionKey
    })
  );

  app.addHook('onRequest', async (request) => {
    request.auth = null;

    const sessionToken = request.cookies[app.config.auth.sessionCookieName];
    if (!sessionToken) {
      return;
    }

    request.auth = await app.authService.authenticateFromSessionCookie(sessionToken);
  });

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(policyRoutes, { prefix: '/policies' });
  await app.register(researcherRoutes, { prefix: '/researcher' });
  await app.register(workflowRoutes, { prefix: '/workflow' });
  await app.register(journalGovernanceRoutes, { prefix: '/journal-governance' });
  await app.register(resourceBookingRoutes, { prefix: '/resource-booking' });
  await app.register(recommendationsRoutes, { prefix: '/recommendations' });
  await app.register(financeRoutes, { prefix: '/finance' });
  await app.register(adminRoutes, { prefix: '/admin' });
};
