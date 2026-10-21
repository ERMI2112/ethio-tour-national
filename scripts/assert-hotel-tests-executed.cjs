/* global require, process, console */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs');

const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const requiredFiles = [
  'hotel-onboarding.integration.test.ts',
  'hotel-location-directory.integration.test.ts',
  'hotel-directory-upgrade.integration.test.ts',
];
if (
  !report.success ||
  report.numTotalTests < 1 ||
  report.numFailedTests ||
  report.numPendingTests
) {
  throw new Error('Hotel integration verification must pass with nonzero tests and zero skips.');
}
for (const file of requiredFiles) {
  const suite = report.testResults.find((result) => result.name.endsWith(file));
  if (
    !suite ||
    !suite.assertionResults.length ||
    suite.assertionResults.some((result) => result.status !== 'passed')
  ) {
    throw new Error(`Required hotel suite did not execute successfully: ${file}`);
  }
}
console.info(
  `Required hotel PostgreSQL suites passed: ${report.numTotalTests} executed, zero failed/skipped.`,
);
