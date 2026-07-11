import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const routes = ['/', '/business-consulting/', '/career-planning/', '/process/', '/approach/'];
const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'tablet', width: 900, height: 900 },
  { name: 'mobile', width: 390, height: 900 },
];
const baseUrl = process.env.POPOVER_CHECK_BASE_URL || 'http://127.0.0.1:4321';
const tolerance = 1;

function startPreview() {
  const child = spawn('npx', ['astro', 'preview', '--host', '0.0.0.0'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    try {
      const res = await fetch(baseUrl, { method: 'HEAD', signal: controller.signal });
      if (res.ok || res.status < 500) return;
    } catch {
      // Retry until the preview server is ready.
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Preview server did not become ready: ${baseUrl}`);
}

async function auditPage(page, route, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });

  return page.evaluate(({ route, viewportName, tolerance }) => {
    const vw = window.innerWidth;
    const popovers = [...document.querySelectorAll('.step-popover')];
    return popovers.map((popover, index) => {
      const rect = popover.getBoundingClientRect();
      const card = popover.closest('.step-popover-card');
      const cardLabel = card?.innerText?.split('\n').slice(0, 2).join(' / ') || `popover-${index + 1}`;
      return {
        route,
        viewport: viewportName,
        card: cardLabel,
        id: popover.id || '',
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        offLeft: rect.left < -tolerance,
        offRight: rect.right > vw + tolerance,
      };
    }).filter((item) => item.offLeft || item.offRight);
  }, { route, viewportName: viewport.name, tolerance });
}

const preview = process.env.POPOVER_CHECK_BASE_URL ? null : startPreview();
let browser;
try {
  await waitForServer();
  console.log(`Preview server ready: ${baseUrl}`);
  browser = await chromium.launch({ timeout: 15000 });
  console.log('Chromium launched for popover check');
  const page = await browser.newPage();
  const failures = [];

  for (const viewport of viewports) {
    for (const route of routes) {
      failures.push(...await auditPage(page, route, viewport));
    }
  }

  if (failures.length > 0) {
    console.error('\nPopover overflow detected:');
    for (const failure of failures) {
      console.error(`- ${failure.viewport} ${failure.route} ${failure.card}: left=${failure.left}, right=${failure.right}, width=${failure.width}, id=${failure.id}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Popover overflow check passed: ${routes.length} routes × ${viewports.length} viewports`);
  }
} finally {
  if (browser) await browser.close();
  if (preview) preview.kill('SIGKILL');
}

process.exit(process.exitCode ?? 0);
