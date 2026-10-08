import { OptionalFields } from '../../core/templateEngine';

// Every optional template field set (REQ-002.I.4): the input of BL-032's phase 2 recording (specCore.test.ts),
// and of the route test that pins a setup with these answers to it (BL-PM-004b).
export const ALL_FIELDS: Required<OptionalFields> = {
  platforms: ['iOS Native', 'Node.js / Express'],
  accessControl: 'Role-based (admin, agent, customer)',
  specialConsiderations: ['Accessibility (WCAG)', 'i18n'],
  accessibilityNotes: 'Screen reader support and right-to-left layout.',
  systemPattern: 'Modular monolith',
  activeUsers: '1,000 - 10,000',
  teamSize: '2-5 devs',
  deploymentTargets: ['AWS', 'Vercel'],
  localDatabases: ['SQLite'],
  dataSyncStrategy: 'Last write wins',
  integrations: { payments: ['Stripe'], ai: ['OpenAI', 'Anthropic'] },
  otherApis: 'Twilio for SMS',
  apiResponseTime: '< 200 ms (p95)',
  availability: '99.9%',
  databases: ['PostgreSQL', 'Redis'],
  authStrategy: 'Clerk',
  realtimeTypes: ['WebSockets'],
  compliance: ['GDPR', 'SOC 2'],
  cicd: ['GitHub Actions'],
  securityConcerns: ['Rate limiting', 'Audit logging'],
  buildTimeline: '3 months',
  constraintDescription: 'Must run on the existing Postgres cluster.',
  testingStrategy: ['Unit', 'E2E'],
};
