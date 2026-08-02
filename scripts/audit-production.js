const { execFileSync } = require('node:child_process');
const frontendPackage = require('../frontend-web/package.json');

let report;
try {
  report = JSON.parse(execFileSync(
    'npm',
    ['audit', '--omit=dev', '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ));
} catch (error) {
  const output = error.stdout?.toString() || '';
  report = JSON.parse(output);
}

const vulnerabilities = Object.entries(report.vulnerabilities || {});
const currentRouter = frontendPackage.dependencies?.['react-router-dom'];
const routerExceptionAllowed = currentRouter === '7.18.2';
const unexpected = vulnerabilities.filter(([name, vulnerability]) => {
  if (!routerExceptionAllowed || !['react-router', 'react-router-dom'].includes(name)) return true;
  const advisories = vulnerability.via.filter((entry) => typeof entry === 'object');
  return advisories.some((entry) => String(entry.source) !== '1124282');
});

if (unexpected.length > 0) {
  console.error('Unexpected runtime vulnerabilities detected:');
  for (const [name, vulnerability] of unexpected) {
    console.error(`- ${name}: ${vulnerability.severity}`);
  }
  process.exit(1);
}

if (vulnerabilities.length > 0) {
  console.warn('Accepted dependency advisory: React Router RSC-only advisory 1124282.');
  console.warn('EcoBazar is a client-only BrowserRouter build and does not use RSC/SSR actions.');
}

console.log('Production dependency audit passed.');
