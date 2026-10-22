// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

export default defineConfig({
  site: 'https://monorepo-skills.dev',
  integrations: [
    starlight({
      title: 'Monorepo Skills',
      description:
        'Agent skills for JS/TS monorepos: audit boundaries, cycles, caching, CI coverage and test leakage with monorepo-doctor, then pay violations down with monorepo-boundaries-cleanup.',
      logo: { src: './public/favicon.svg', replacesTitle: false },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/santoshyadavdev/monorepo-doctor' }],
      editLink: { baseUrl: 'https://github.com/santoshyadavdev/monorepo-doctor/edit/master/site/' },
      lastUpdated: true,
      plugins: [
        starlightLlmsTxt({
          projectName: 'Monorepo Skills',
          description:
            'Two agent skills for JS/TS monorepos (npm, yarn, pnpm, bun workspaces; Nx; Turborepo). monorepo-doctor is a read-only audit that writes Markdown and JSON reports. monorepo-boundaries-cleanup is a refactoring workflow that removes boundary violations in small PRs against a baseline.',
          details:
            'Raw skill files are served at /skills/<skill>/SKILL.md and /skills/monorepo-doctor/references/<file>.md. Install with `npx skills add santoshyadavdev/monorepo-doctor --skill <skill>`.',
          promote: ['index*', 'getting-started', 'for-agents', 'skills/**'],
        }),
      ],
      sidebar: [
        { label: 'Start here', items: ['getting-started', 'for-agents'] },
        { label: 'Skills', items: ['skills/monorepo-doctor', 'skills/monorepo-boundaries-cleanup'] },
        { label: 'Guides', items: ['guides/ci', 'guides/caching-and-stale-results', 'guides/doctor-to-cleanup'] },
        {
          label: 'Reference',
          items: [
            { label: 'monorepo-doctor', items: [{ autogenerate: { directory: 'reference/monorepo-doctor' } }] },
            { label: 'monorepo-boundaries-cleanup', items: [{ autogenerate: { directory: 'reference/monorepo-boundaries-cleanup' } }] },
          ],
        },
        { label: 'Project', items: ['faq', 'prior-art', 'contributing'] },
      ],
    }),
  ],
});
