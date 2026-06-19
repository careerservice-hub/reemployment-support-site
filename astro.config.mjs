import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://careerservice-hub.github.io',
  base: '/reemployment-support-site/',
  integrations: [sitemap()],
});
