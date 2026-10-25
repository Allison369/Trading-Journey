/**
 * Run a package's jest suite and print a one-line summary.
 *
 * Written as a file rather than an inline shell command because quoting a
 * JavaScript one-liner through cmd.exe and PowerShell is fragile enough to
 * produce parse errors that look like test failures.
 *
 * Usage: node scripts/test-summary.mjs <package-dir> [label]
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const [, , dir, label = dir] = process.argv;

if (!dir) {
  console.error("Usage: node scripts/test-summary.mjs <package-dir> [label]");
  process.exit(2);
}

const outFile = join(dir, ".jest-summary.json");

const run = spawnSync("npx", ["jest", "--json", "--outputFile=.jest-summary.json"], {
  cwd: dir,
  shell: true,
  encoding: "utf8",
});

if (!existsSync(outFile)) {
  console.error(`${label}: jest produced no report.`);
  console.error(run.stdout?.slice(-4000) ?? "");
  console.error(run.stderr?.slice(-4000) ?? "");
  process.exit(1);
}

const report = JSON.parse(readFileSync(outFile, "utf8"));
unlinkSync(outFile);

const ok = report.numFailedTests === 0 && report.numFailedTestSuites === 0;

console.log(
  `${ok ? "PASS" : "FAIL"} ${label}: ` +
    `${report.numPassedTests} passed, ${report.numFailedTests} failed, ` +
    `${report.numPassedTestSuites}/${report.numTotalTestSuites} suites`
);

if (!ok) {
  for (const suite of report.testResults) {
    if (suite.status !== "passed") {
      console.error(`  ${suite.name}`);
      for (const assertion of suite.assertionResults) {
        if (assertion.status === "failed") {
          console.error(`    - ${assertion.fullName}`);
        }
      }
    }
  }
}

process.exit(ok ? 0 : 1);
