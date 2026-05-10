import { appendFileSync, readFileSync } from "fs";
import { resolve } from "path";

try {
  const resultsPath = resolve(__dirname, "../test-results.json");
  const data = JSON.parse(readFileSync(resultsPath, "utf-8"));

  const summary = data;
  if (!summary) {
    throw new Error("No summary found in Vitest output");
  }

  const numTotalTestSuites = data.numTotalTestSuites;
  const numPassedTestSuites = data.numPassedTestSuites;
  const numFailedTestSuites = data.numFailedTestSuites;
  const _numPendingTestSuites = data.numPendingTestSuites;

  const numTotalTests = data.numTotalTests;
  const numPassedTests = data.numPassedTests;
  const numFailedTests = data.numFailedTests;
  const numPendingTests = data.numPendingTests;
  const numTodoTests = data.numTodoTests;

  const isSuccess = numFailedTests === 0 && numFailedTestSuites === 0;
  const icon = isSuccess ? "✅" : "❌";

  const totalOther = numPendingTests + numTodoTests;

  const markdown = `
### Vitest Test Report

**Summary**
- **Test Files:** ${numFailedTestSuites > 0 ? "❌" : "✅"} ${numPassedTestSuites} pass · ${numTotalTestSuites} total
- **Test Results:** ${icon} ${numPassedTests} passes · ${numTotalTests} total
- **Other:** ${totalOther} skips · ${totalOther} total
`;

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  } else {
    console.log(markdown);
  }
} catch (error) {
  console.error("Failed to generate Vitest summary:", error);
}
