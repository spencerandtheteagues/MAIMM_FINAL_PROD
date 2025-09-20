#!/usr/bin/env node
/**
 * CI/CD Test Runner
 * Orchestrates all test suites for deployment gates
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_URL = process.env.TEST_URL || 'https://myaimediamgr.onrender.com';
const DEPLOYMENT_ENV = process.env.DEPLOYMENT_ENV || 'production';
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;

class CITestRunner {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      environment: DEPLOYMENT_ENV,
      targetUrl: TEST_URL,
      suites: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      },
      deployment: {
        shouldDeploy: false,
        blockingIssues: [],
        warnings: []
      }
    };
  }

  async runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: options.silent ? 'pipe' : 'inherit',
        env: { ...process.env, TEST_URL },
        shell: true,
        ...options
      });

      let stdout = '';
      let stderr = '';

      if (options.silent) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      child.on('close', (code) => {
        resolve({
          code,
          stdout,
          stderr,
          success: code === 0
        });
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  async runTestSuite(name, command, critical = true) {
    console.log(`\n🧪 Running ${name}...`);
    const startTime = Date.now();

    try {
      const result = await this.runCommand('node', [command], { silent: false });
      const duration = Date.now() - startTime;

      const suite = {
        name,
        status: result.success ? 'passed' : 'failed',
        duration,
        critical,
        exitCode: result.code
      };

      this.results.suites.push(suite);
      this.results.summary.total++;

      if (result.success) {
        this.results.summary.passed++;
        console.log(`✅ ${name} PASSED (${duration}ms)`);
      } else {
        this.results.summary.failed++;
        console.log(`❌ ${name} FAILED (${duration}ms)`);

        if (critical) {
          this.results.deployment.blockingIssues.push({
            suite: name,
            message: `Critical test suite failed with exit code ${result.code}`
          });
        } else {
          this.results.deployment.warnings.push({
            suite: name,
            message: `Non-critical test suite failed with exit code ${result.code}`
          });
        }
      }

      return suite;
    } catch (error) {
      const suite = {
        name,
        status: 'error',
        error: error.message,
        critical
      };

      this.results.suites.push(suite);
      this.results.summary.failed++;

      if (critical) {
        this.results.deployment.blockingIssues.push({
          suite: name,
          message: error.message
        });
      }

      console.error(`🔥 ${name} ERROR: ${error.message}`);
      return suite;
    }
  }

  async runPreDeploymentChecks() {
    console.log('\n====== PRE-DEPLOYMENT CHECKS ======');

    // Critical tests that must pass
    await this.runTestSuite(
      'Critical Flow Tests',
      './tests/critical-flow-tests.mjs',
      true
    );

    await this.runTestSuite(
      'User Journey Tests',
      './tests/integration/user-journey.test.mjs',
      true
    );

    // Non-critical but important tests
    await this.runTestSuite(
      'Performance Tests',
      './tests/performance/load-test.mjs',
      false
    );
  }

  async runSmokeTests() {
    console.log('\n====== SMOKE TESTS ======');

    const smokeTests = [
      { name: 'Health Check', endpoint: '/api/health' },
      { name: 'Landing Page', endpoint: '/' },
      { name: 'Pricing Page', endpoint: '/pricing' },
      { name: 'Trial Selection', endpoint: '/trial-selection' },
      { name: 'Auth Page', endpoint: '/auth' }
    ];

    for (const test of smokeTests) {
      try {
        const response = await fetch(`${TEST_URL}${test.endpoint}`, {
          timeout: 10000
        });

        if (response.ok) {
          console.log(`✅ ${test.name}: OK (${response.status})`);
        } else {
          console.log(`⚠️ ${test.name}: ${response.status}`);
          this.results.deployment.warnings.push({
            test: test.name,
            message: `Returned status ${response.status}`
          });
        }
      } catch (error) {
        console.error(`❌ ${test.name}: FAILED`);
        this.results.deployment.blockingIssues.push({
          test: test.name,
          message: error.message
        });
      }
    }
  }

  async analyzeResults() {
    console.log('\n====== DEPLOYMENT DECISION ======');

    // Determine if deployment should proceed
    this.results.deployment.shouldDeploy =
      this.results.deployment.blockingIssues.length === 0;

    if (this.results.deployment.shouldDeploy) {
      console.log('✅ DEPLOYMENT CAN PROCEED');

      if (this.results.deployment.warnings.length > 0) {
        console.log('\n⚠️ Warnings:');
        this.results.deployment.warnings.forEach(w => {
          console.log(`  - ${w.suite || w.test}: ${w.message}`);
        });
      }
    } else {
      console.log('🚫 DEPLOYMENT BLOCKED');
      console.log('\n❌ Blocking Issues:');
      this.results.deployment.blockingIssues.forEach(issue => {
        console.log(`  - ${issue.suite || issue.test}: ${issue.message}`);
      });
    }

    // Calculate quality score
    const passRate = this.results.summary.total > 0
      ? (this.results.summary.passed / this.results.summary.total) * 100
      : 0;

    this.results.deployment.qualityScore = Math.round(passRate);
    console.log(`\n📊 Quality Score: ${this.results.deployment.qualityScore}%`);

    return this.results.deployment.shouldDeploy;
  }

  async saveResults() {
    const reportDir = path.join(__dirname, '../test-reports/ci');
    await fs.mkdir(reportDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportDir, `ci-test-${timestamp}.json`);

    await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n📁 Results saved to: ${reportPath}`);

    // Generate deployment gate file
    const gateFile = path.join(reportDir, 'deployment-gate.json');
    await fs.writeFile(gateFile, JSON.stringify({
      shouldDeploy: this.results.deployment.shouldDeploy,
      qualityScore: this.results.deployment.qualityScore,
      timestamp: this.results.timestamp,
      environment: this.results.environment
    }, null, 2));

    return reportPath;
  }

  async notifySlack() {
    if (!SLACK_WEBHOOK) return;

    const emoji = this.results.deployment.shouldDeploy ? '✅' : '🚫';
    const color = this.results.deployment.shouldDeploy ? 'good' : 'danger';

    const payload = {
      username: 'Deployment Bot',
      icon_emoji: ':robot_face:',
      attachments: [{
        color,
        title: `${emoji} Deployment Decision: ${this.results.deployment.shouldDeploy ? 'PROCEED' : 'BLOCKED'}`,
        fields: [
          {
            title: 'Environment',
            value: this.results.environment,
            short: true
          },
          {
            title: 'Quality Score',
            value: `${this.results.deployment.qualityScore}%`,
            short: true
          },
          {
            title: 'Test Results',
            value: `✅ ${this.results.summary.passed} Passed | ❌ ${this.results.summary.failed} Failed`,
            short: false
          }
        ],
        footer: 'CI/CD Pipeline',
        ts: Math.floor(Date.now() / 1000)
      }]
    };

    if (this.results.deployment.blockingIssues.length > 0) {
      payload.attachments[0].fields.push({
        title: 'Blocking Issues',
        value: this.results.deployment.blockingIssues.map(i => `• ${i.message}`).join('\n'),
        short: false
      });
    }

    try {
      await fetch(SLACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log('📨 Slack notification sent');
    } catch (error) {
      console.error('Failed to send Slack notification:', error);
    }
  }

  async runAll() {
    console.log('\n========================================');
    console.log('   CI/CD TEST RUNNER');
    console.log(`   Target: ${TEST_URL}`);
    console.log(`   Environment: ${DEPLOYMENT_ENV}`);
    console.log('========================================');

    try {
      await this.runPreDeploymentChecks();
      await this.runSmokeTests();
      const shouldDeploy = await this.analyzeResults();
      await this.saveResults();
      await this.notifySlack();

      console.log('\n========================================');
      console.log('   SUMMARY');
      console.log('========================================');
      console.log(`Total Tests: ${this.results.summary.total}`);
      console.log(`Passed: ${this.results.summary.passed}`);
      console.log(`Failed: ${this.results.summary.failed}`);
      console.log(`Quality Score: ${this.results.deployment.qualityScore}%`);
      console.log(`Deployment: ${shouldDeploy ? 'APPROVED ✅' : 'BLOCKED 🚫'}`);
      console.log('========================================\n');

      // Exit with appropriate code for CI/CD
      process.exit(shouldDeploy ? 0 : 1);

    } catch (error) {
      console.error('Fatal error in CI test runner:', error);
      process.exit(1);
    }
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new CITestRunner();
  runner.runAll();
}

export default CITestRunner;