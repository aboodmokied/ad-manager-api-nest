import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { WorkspaceRole } from '@uacm/shared-types';

process.env.USE_MOCK_PRISMA = 'true';
process.env.REDIS_URL = '';
process.env.RABBITMQ_URL = '';

describe('Workspaces Adversarial Security & Multi-Tenancy Matrix (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let jwtService: JwtService;

  // Test User IDs
  const USER_OWNER_A = 'user-owner-a';
  const USER_ADMIN_A = 'user-admin-a';
  const USER_BUYER_A = 'user-buyer-a';
  const USER_ANALYST_A = 'user-analyst-a';
  const USER_VIEWER_A = 'user-viewer-a';

  const USER_OWNER_B = 'user-owner-b';
  const USER_OUTSIDER = 'user-outsider';

  // Tokens
  let tokenOwnerA: string;
  let tokenAdminA: string;
  let tokenBuyerA: string;
  let tokenAnalystA: string;
  let tokenViewerA: string;
  let tokenOwnerB: string;
  let tokenOutsider: string;

  // Workspaces
  let wsA: any;
  let wsB: any;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: ['api/health', 'health'],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    const signToken = (sub: string, email: string) =>
      jwtService.signAsync({ sub, email, type: 'access' });

    tokenOwnerA = await signToken(USER_OWNER_A, 'owner-a@example.com');
    tokenAdminA = await signToken(USER_ADMIN_A, 'admin-a@example.com');
    tokenBuyerA = await signToken(USER_BUYER_A, 'buyer-a@example.com');
    tokenAnalystA = await signToken(USER_ANALYST_A, 'analyst-a@example.com');
    tokenViewerA = await signToken(USER_VIEWER_A, 'viewer-a@example.com');
    tokenOwnerB = await signToken(USER_OWNER_B, 'owner-b@example.com');
    tokenOutsider = await signToken(USER_OUTSIDER, 'outsider@example.com');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Reset or seed fresh workspaces in mock Prisma
    // Create Workspace A with USER_OWNER_A
    wsA = await prisma.workspace.create({
      data: {
        name: `Workspace Alpha ${Date.now()}`,
        slug: `ws-alpha-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        baseCurrency: 'USD',
        members: {
          create: {
            userId: USER_OWNER_A,
            role: WorkspaceRole.OWNER,
          },
        },
      },
    });

    // Add remaining 4 roles to Workspace A
    await prisma.workspaceMember.create({
      data: {
        workspaceId: wsA.id,
        userId: USER_ADMIN_A,
        role: WorkspaceRole.ADMIN,
      },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: wsA.id,
        userId: USER_BUYER_A,
        role: WorkspaceRole.MEDIA_BUYER,
      },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: wsA.id,
        userId: USER_ANALYST_A,
        role: WorkspaceRole.ANALYST,
      },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: wsA.id,
        userId: USER_VIEWER_A,
        role: WorkspaceRole.CLIENT_VIEWER,
      },
    });

    // Create Workspace B with USER_OWNER_B
    wsB = await prisma.workspace.create({
      data: {
        name: `Workspace Beta ${Date.now()}`,
        slug: `ws-beta-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        baseCurrency: 'EUR',
        members: {
          create: {
            userId: USER_OWNER_B,
            role: WorkspaceRole.OWNER,
          },
        },
      },
    });
  });

  describe('DIMENSION 1: Unauthenticated Access Enforcement (401 Unauthorized)', () => {
    it('rejects GET /api/v1/workspaces without token', () => {
      return request(app.getHttpServer()).get('/api/v1/workspaces').expect(401);
    });

    it('rejects POST /api/v1/workspaces without token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .send({ name: 'Unauth WS' })
        .expect(401);
    });

    it('rejects GET /api/v1/workspaces/:id without token', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/workspaces/${wsA.id}`)
        .expect(401);
    });

    it('rejects PATCH /api/v1/workspaces/:id without token', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${wsA.id}`)
        .send({ name: 'Hacked Name' })
        .expect(401);
    });

    it('rejects DELETE /api/v1/workspaces/:id without token', () => {
      return request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${wsA.id}`)
        .expect(401);
    });

    it('rejects GET /api/v1/workspaces/:id/members without token', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/workspaces/${wsA.id}/members`)
        .expect(401);
    });

    it('rejects POST /api/v1/workspaces/:id/members without token', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/workspaces/${wsA.id}/members`)
        .send({ userId: 'attacker', role: WorkspaceRole.ADMIN })
        .expect(401);
    });

    it('rejects PATCH /api/v1/workspaces/:id/members/:mId without token', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${wsA.id}/members/some-id`)
        .send({ role: WorkspaceRole.OWNER })
        .expect(401);
    });

    it('rejects DELETE /api/v1/workspaces/:id/members/:mId without token', () => {
      return request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${wsA.id}/members/some-id`)
        .expect(401);
    });
  });

  describe('DIMENSION 2: Multi-Tenancy Cross-Tenant Isolation (403 Forbidden)', () => {
    it('user in Workspace B cannot read Workspace A details (403 Forbidden)', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/workspaces/${wsA.id}`)
        .set('Authorization', `Bearer ${tokenOwnerB}`)
        .expect(403);
    });

    it('outsider cannot read Workspace A details (403 Forbidden)', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/workspaces/${wsA.id}`)
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .expect(403);
    });

    it('user in Workspace B cannot list Workspace A members (403 Forbidden)', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/workspaces/${wsA.id}/members`)
        .set('Authorization', `Bearer ${tokenOwnerB}`)
        .expect(403);
    });

    it('user in Workspace B cannot update Workspace A (403 Forbidden)', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${wsA.id}`)
        .set('Authorization', `Bearer ${tokenOwnerB}`)
        .send({ name: 'Tampered Name' })
        .expect(403);
    });

    it('user in Workspace B cannot delete Workspace A (403 Forbidden)', () => {
      return request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${wsA.id}`)
        .set('Authorization', `Bearer ${tokenOwnerB}`)
        .expect(403);
    });

    it('user in Workspace B cannot add members to Workspace A (403 Forbidden)', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/workspaces/${wsA.id}/members`)
        .set('Authorization', `Bearer ${tokenOwnerB}`)
        .send({ userId: USER_OWNER_B, role: WorkspaceRole.ADMIN })
        .expect(403);
    });

    it('user in Workspace B cannot update member role in Workspace A (403 Forbidden)', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${wsA.id}/members/${USER_ADMIN_A}`)
        .set('Authorization', `Bearer ${tokenOwnerB}`)
        .send({ role: WorkspaceRole.CLIENT_VIEWER })
        .expect(403);
    });

    it('user in Workspace B cannot remove member from Workspace A (403 Forbidden)', () => {
      return request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${wsA.id}/members/${USER_ADMIN_A}`)
        .set('Authorization', `Bearer ${tokenOwnerB}`)
        .expect(403);
    });
  });

  describe('DIMENSION 3: RBAC Hierarchy Enforcement Across All 5 Roles', () => {
    describe('Role: OWNER (Level 100)', () => {
      it('can view workspace details', () => {
        return request(app.getHttpServer())
          .get(`/api/v1/workspaces/${wsA.id}`)
          .set('Authorization', `Bearer ${tokenOwnerA}`)
          .expect(200)
          .expect((res) => {
            expect(res.body.id).toBe(wsA.id);
            expect(res.body.role).toBe(WorkspaceRole.OWNER);
          });
      });

      it('can update workspace configuration', () => {
        return request(app.getHttpServer())
          .patch(`/api/v1/workspaces/${wsA.id}`)
          .set('Authorization', `Bearer ${tokenOwnerA}`)
          .send({ name: 'Owner Updated Alpha' })
          .expect(200)
          .expect((res) => {
            expect(res.body.name).toBe('Owner Updated Alpha');
          });
      });

      it('can add member to workspace', () => {
        return request(app.getHttpServer())
          .post(`/api/v1/workspaces/${wsA.id}/members`)
          .set('Authorization', `Bearer ${tokenOwnerA}`)
          .send({ userId: 'new-user-1', role: WorkspaceRole.MEDIA_BUYER })
          .expect(201);
      });

      it('can update member role', () => {
        return request(app.getHttpServer())
          .patch(`/api/v1/workspaces/${wsA.id}/members/${USER_BUYER_A}`)
          .set('Authorization', `Bearer ${tokenOwnerA}`)
          .send({ role: WorkspaceRole.ADMIN })
          .expect(200)
          .expect((res) => {
            expect(res.body.role).toBe(WorkspaceRole.ADMIN);
          });
      });

      it('can remove member from workspace', () => {
        return request(app.getHttpServer())
          .delete(`/api/v1/workspaces/${wsA.id}/members/${USER_VIEWER_A}`)
          .set('Authorization', `Bearer ${tokenOwnerA}`)
          .expect(200);
      });

      it('can delete workspace', async () => {
        // Create disposable workspace
        const disposable = await prisma.workspace.create({
          data: {
            name: 'Disposable',
            slug: `disp-${Date.now()}`,
            baseCurrency: 'USD',
            members: {
              create: { userId: USER_OWNER_A, role: WorkspaceRole.OWNER },
            },
          },
        });

        return request(app.getHttpServer())
          .delete(`/api/v1/workspaces/${disposable.id}`)
          .set('Authorization', `Bearer ${tokenOwnerA}`)
          .expect(200)
          .expect((res) => {
            expect(res.body.success).toBe(true);
          });
      });
    });

    describe('Role: ADMIN (Level 80)', () => {
      it('can view workspace details', () => {
        return request(app.getHttpServer())
          .get(`/api/v1/workspaces/${wsA.id}`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .expect(200);
      });

      it('can update workspace configuration', () => {
        return request(app.getHttpServer())
          .patch(`/api/v1/workspaces/${wsA.id}`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ name: 'Admin Updated Alpha' })
          .expect(200);
      });

      it('can add member to workspace', () => {
        return request(app.getHttpServer())
          .post(`/api/v1/workspaces/${wsA.id}/members`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ userId: 'new-user-admin-add', role: WorkspaceRole.ANALYST })
          .expect(201);
      });

      it('can update member role', () => {
        return request(app.getHttpServer())
          .patch(`/api/v1/workspaces/${wsA.id}/members/${USER_ANALYST_A}`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .send({ role: WorkspaceRole.MEDIA_BUYER })
          .expect(200);
      });

      it('can remove member from workspace', () => {
        return request(app.getHttpServer())
          .delete(`/api/v1/workspaces/${wsA.id}/members/${USER_BUYER_A}`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .expect(200);
      });

      it('CANNOT delete workspace (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .delete(`/api/v1/workspaces/${wsA.id}`)
          .set('Authorization', `Bearer ${tokenAdminA}`)
          .expect(403);
      });
    });

    describe('Role: MEDIA_BUYER (Level 60)', () => {
      it('can view workspace details', () => {
        return request(app.getHttpServer())
          .get(`/api/v1/workspaces/${wsA.id}`)
          .set('Authorization', `Bearer ${tokenBuyerA}`)
          .expect(200);
      });

      it('can list members', () => {
        return request(app.getHttpServer())
          .get(`/api/v1/workspaces/${wsA.id}/members`)
          .set('Authorization', `Bearer ${tokenBuyerA}`)
          .expect(200);
      });

      it('CANNOT update workspace configuration (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .patch(`/api/v1/workspaces/${wsA.id}`)
          .set('Authorization', `Bearer ${tokenBuyerA}`)
          .send({ name: 'Buyer Attempted Name' })
          .expect(403);
      });

      it('CANNOT delete workspace (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .delete(`/api/v1/workspaces/${wsA.id}`)
          .set('Authorization', `Bearer ${tokenBuyerA}`)
          .expect(403);
      });

      it('CANNOT add member (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .post(`/api/v1/workspaces/${wsA.id}/members`)
          .set('Authorization', `Bearer ${tokenBuyerA}`)
          .send({ userId: 'rogue-user', role: WorkspaceRole.CLIENT_VIEWER })
          .expect(403);
      });

      it('CANNOT update member role (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .patch(`/api/v1/workspaces/${wsA.id}/members/${USER_VIEWER_A}`)
          .set('Authorization', `Bearer ${tokenBuyerA}`)
          .send({ role: WorkspaceRole.ADMIN })
          .expect(403);
      });

      it('CANNOT remove member (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .delete(`/api/v1/workspaces/${wsA.id}/members/${USER_VIEWER_A}`)
          .set('Authorization', `Bearer ${tokenBuyerA}`)
          .expect(403);
      });
    });

    describe('Role: ANALYST (Level 40)', () => {
      it('can view workspace details', () => {
        return request(app.getHttpServer())
          .get(`/api/v1/workspaces/${wsA.id}`)
          .set('Authorization', `Bearer ${tokenAnalystA}`)
          .expect(200);
      });

      it('can list members', () => {
        return request(app.getHttpServer())
          .get(`/api/v1/workspaces/${wsA.id}/members`)
          .set('Authorization', `Bearer ${tokenAnalystA}`)
          .expect(200);
      });

      it('CANNOT update workspace configuration (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .patch(`/api/v1/workspaces/${wsA.id}`)
          .set('Authorization', `Bearer ${tokenAnalystA}`)
          .send({ name: 'Analyst Attempted Name' })
          .expect(403);
      });

      it('CANNOT delete workspace (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .delete(`/api/v1/workspaces/${wsA.id}`)
          .set('Authorization', `Bearer ${tokenAnalystA}`)
          .expect(403);
      });

      it('CANNOT add member (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .post(`/api/v1/workspaces/${wsA.id}/members`)
          .set('Authorization', `Bearer ${tokenAnalystA}`)
          .send({
            userId: 'rogue-analyst-add',
            role: WorkspaceRole.CLIENT_VIEWER,
          })
          .expect(403);
      });

      it('CANNOT update member role (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .patch(`/api/v1/workspaces/${wsA.id}/members/${USER_VIEWER_A}`)
          .set('Authorization', `Bearer ${tokenAnalystA}`)
          .send({ role: WorkspaceRole.ADMIN })
          .expect(403);
      });

      it('CANNOT remove member (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .delete(`/api/v1/workspaces/${wsA.id}/members/${USER_VIEWER_A}`)
          .set('Authorization', `Bearer ${tokenAnalystA}`)
          .expect(403);
      });
    });

    describe('Role: CLIENT_VIEWER (Level 20)', () => {
      it('can view workspace details', () => {
        return request(app.getHttpServer())
          .get(`/api/v1/workspaces/${wsA.id}`)
          .set('Authorization', `Bearer ${tokenViewerA}`)
          .expect(200);
      });

      it('can list members', () => {
        return request(app.getHttpServer())
          .get(`/api/v1/workspaces/${wsA.id}/members`)
          .set('Authorization', `Bearer ${tokenViewerA}`)
          .expect(200);
      });

      it('CANNOT update workspace configuration (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .patch(`/api/v1/workspaces/${wsA.id}`)
          .set('Authorization', `Bearer ${tokenViewerA}`)
          .send({ name: 'Viewer Attempted Name' })
          .expect(403);
      });

      it('CANNOT delete workspace (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .delete(`/api/v1/workspaces/${wsA.id}`)
          .set('Authorization', `Bearer ${tokenViewerA}`)
          .expect(403);
      });

      it('CANNOT add member (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .post(`/api/v1/workspaces/${wsA.id}/members`)
          .set('Authorization', `Bearer ${tokenViewerA}`)
          .send({
            userId: 'rogue-viewer-add',
            role: WorkspaceRole.CLIENT_VIEWER,
          })
          .expect(403);
      });

      it('CANNOT update member role (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .patch(`/api/v1/workspaces/${wsA.id}/members/${USER_BUYER_A}`)
          .set('Authorization', `Bearer ${tokenViewerA}`)
          .send({ role: WorkspaceRole.ADMIN })
          .expect(403);
      });

      it('CANNOT remove member (403 Forbidden)', () => {
        return request(app.getHttpServer())
          .delete(`/api/v1/workspaces/${wsA.id}/members/${USER_BUYER_A}`)
          .set('Authorization', `Bearer ${tokenViewerA}`)
          .expect(403);
      });
    });
  });

  describe('DIMENSION 4: Adversarial Stress Test — Cross-Tenant Header Confusion / Parameter Desynchronization', () => {
    it('ATTACK: User A passes header x-workspace-id: wsA while calling GET /api/v1/workspaces/:wsB/members', async () => {
      // Attacker has OWNER in wsA, targets wsB in URL, but attaches x-workspace-id: wsA.id
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${wsB.id}/members`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('x-workspace-id', wsA.id);

      // SECURITY AUDIT: If this returns 200, attacker successfully bypassed tenant isolation via header spoofing!
      // In a secure multi-tenant system, this MUST BE 403 Forbidden because User A is NOT a member of wsB.
      expect(res.status).toBe(403);
    });

    it('ATTACK: User A passes header x-workspace-id: wsA while calling DELETE /api/v1/workspaces/:wsB', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${wsB.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('x-workspace-id', wsA.id);

      // SECURITY AUDIT: Must be 403 Forbidden.
      expect(res.status).toBe(403);
    });

    it('ATTACK: User A passes header x-workspace-id: wsA while calling PATCH /api/v1/workspaces/:wsB', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${wsB.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('x-workspace-id', wsA.id)
        .send({ name: 'Compromised Beta' });

      // SECURITY AUDIT: Must be 403 Forbidden.
      expect(res.status).toBe(403);
    });

    it('ATTACK: User A passes header x-workspace-id: wsA while calling POST /api/v1/workspaces/:wsB/members', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${wsB.id}/members`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('x-workspace-id', wsA.id)
        .send({ userId: USER_OWNER_A, role: WorkspaceRole.ADMIN });

      // SECURITY AUDIT: Must be 403 Forbidden.
      expect(res.status).toBe(403);
    });

    it('ATTACK: User A passes header x-workspace-id: wsA while calling DELETE /api/v1/workspaces/:wsB/members/:memberId', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${wsB.id}/members/${USER_OWNER_B}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('x-workspace-id', wsA.id);

      // SECURITY AUDIT: Must be 403 Forbidden.
      expect(res.status).toBe(403);
    });
  });

  describe('DIMENSION 5: Data Validation & Integrity Boundaries', () => {
    it('rejects adding member with invalid role value (400 Bad Request)', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/workspaces/${wsA.id}/members`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({ userId: 'some-user', role: 'SUPER_ROOT_ROLE' })
        .expect(400);
    });

    it('rejects adding duplicate member to same workspace (409 Conflict)', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/workspaces/${wsA.id}/members`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({ userId: USER_ADMIN_A, role: WorkspaceRole.ADMIN })
        .expect(409);
    });

    it('rejects creating workspace with duplicate slug (409 Conflict)', async () => {
      const slug = `dup-slug-${Date.now()}`;
      await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({ name: 'Alpha Duplicate', slug })
        .expect(201);

      return request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${tokenOwnerB}`)
        .send({ name: 'Beta Duplicate', slug })
        .expect(409);
    });

    it('rejects creating workspace with empty name (400 Bad Request)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({ name: '' })
        .expect(400);
    });
  });

  describe('DIMENSION 6: Health Endpoint (/api/health and /health)', () => {
    it('returns 200 OK from /api/health without api/v1 prefix disruption', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.version).toBe('1.0.0');
          expect(typeof res.body.uptime).toBe('number');
          expect(res.body.timestamp).toBeDefined();
        });
    });

    it('returns 200 OK from /health', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
        });
    });
  });
});
