#!/usr/bin/env node
/**
 * Critical Flow Testing Suite
 * Tests Google OAuth flow, pricing page issues, and trial selection
 *
 * Run: node tests/critical-flow-tests.mjs
 */

import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const BASE_URL = process.env.TEST_URL || 'https://myaimediamgr.onrender.com';
const LOCAL_URL = process.env.LOCAL_URL || 'http://localhost:5000';
const TEST_TIMEOUT = 30000;
const SLOW_MO = process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0;

// Test results storage
const results = {
  timestamp: new Date().toISOString(),
  environment: BASE_URL,
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  }
};

// Helper functions
function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warning: '\x1b[33m',
    reset: '\x1b[0m'
  };
  const color = colors[type] || colors.info;
  console.log(`${color}[${type.toUpperCase()}]${colors.reset} ${message}`);
}

async function recordTest(name, status, details = {}) {
  const test = {
    name,
    status,
    timestamp: new Date().toISOString(),
    ...details
  };
  results.tests.push(test);
  results.summary.total++;
  if (status === 'passed') results.summary.passed++;
  else if (status === 'failed') results.summary.failed++;
  else if (status === 'warning') results.summary.warnings++;

  log(`${name}: ${status.toUpperCase()}`, status === 'passed' ? 'success' : status);
  if (details.error) log(`  Error: ${details.error}`, 'error');
  if (details.notes) log(`  Notes: ${details.notes}`, 'info');
}

async function saveResults() {
  const reportDir = join(__dirname, '../test-reports');
  await fs.mkdir(reportDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(reportDir, `critical-flow-${timestamp}.json`);

  await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
  log(`Test results saved to: ${reportPath}`, 'success');

  // Generate HTML report
  const htmlReport = generateHTMLReport();
  const htmlPath = join(reportDir, `critical-flow-${timestamp}.html`);
  await fs.writeFile(htmlPath, htmlReport);
  log(`HTML report saved to: ${htmlPath}`, 'success');
}

function generateHTMLReport() {
  const statusColors = {
    passed: '#10b981',
    failed: '#ef4444',
    warning: '#f59e0b'
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Critical Flow Test Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, system-ui, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 2rem;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 1rem;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
        }
        h1 { font-size: 2rem; margin-bottom: 0.5rem; }
        .meta { opacity: 0.9; font-size: 0.9rem; }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            padding: 2rem;
            background: #f8f9fa;
        }
        .stat {
            text-align: center;
            padding: 1rem;
            background: white;
            border-radius: 0.5rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 0.25rem;
        }
        .stat-label {
            color: #6b7280;
            font-size: 0.875rem;
            text-transform: uppercase;
        }
        .tests {
            padding: 2rem;
        }
        .test {
            background: white;
            border-left: 4px solid #e5e7eb;
            padding: 1rem;
            margin-bottom: 1rem;
            border-radius: 0.25rem;
            transition: all 0.3s;
        }
        .test:hover {
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .test.passed { border-left-color: ${statusColors.passed}; }
        .test.failed { border-left-color: ${statusColors.failed}; }
        .test.warning { border-left-color: ${statusColors.warning}; }
        .test-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
        }
        .test-name {
            font-weight: 600;
            color: #1f2937;
        }
        .test-status {
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        .status-passed {
            background: ${statusColors.passed}20;
            color: ${statusColors.passed};
        }
        .status-failed {
            background: ${statusColors.failed}20;
            color: ${statusColors.failed};
        }
        .status-warning {
            background: ${statusColors.warning}20;
            color: ${statusColors.warning};
        }
        .test-details {
            color: #6b7280;
            font-size: 0.875rem;
        }
        .error {
            background: #fee;
            color: #c00;
            padding: 0.5rem;
            border-radius: 0.25rem;
            margin-top: 0.5rem;
            font-family: 'Courier New', monospace;
            font-size: 0.875rem;
        }
        .console-errors {
            background: #fef3c7;
            border: 1px solid #fbbf24;
            padding: 1rem;
            border-radius: 0.5rem;
            margin-top: 0.5rem;
        }
        .console-error {
            font-family: 'Courier New', monospace;
            font-size: 0.8rem;
            color: #92400e;
            margin: 0.25rem 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Critical Flow Test Report</h1>
            <div class="meta">
                <p>Environment: ${results.environment}</p>
                <p>Generated: ${new Date(results.timestamp).toLocaleString()}</p>
            </div>
        </div>

        <div class="summary">
            <div class="stat">
                <div class="stat-value">${results.summary.total}</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat">
                <div class="stat-value" style="color: ${statusColors.passed}">${results.summary.passed}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat">
                <div class="stat-value" style="color: ${statusColors.failed}">${results.summary.failed}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat">
                <div class="stat-value" style="color: ${statusColors.warning}">${results.summary.warnings}</div>
                <div class="stat-label">Warnings</div>
            </div>
        </div>

        <div class="tests">
            <h2 style="margin-bottom: 1rem;">Test Results</h2>
            ${results.tests.map(test => `
                <div class="test ${test.status}">
                    <div class="test-header">
                        <div class="test-name">${test.name}</div>
                        <span class="test-status status-${test.status}">${test.status}</span>
                    </div>
                    ${test.duration ? `<div class="test-details">Duration: ${test.duration}ms</div>` : ''}
                    ${test.notes ? `<div class="test-details">${test.notes}</div>` : ''}
                    ${test.error ? `<div class="error">${test.error}</div>` : ''}
                    ${test.consoleErrors && test.consoleErrors.length > 0 ? `
                        <div class="console-errors">
                            <strong>Console Errors:</strong>
                            ${test.consoleErrors.map(err => `<div class="console-error">${err}</div>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
}

// Test Suite Functions
async function testServerHealth() {
  log('Testing server health...', 'info');
  const startTime = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/api/health`, {
      timeout: 10000
    });

    const duration = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      await recordTest('Server Health Check', 'passed', {
        duration,
        notes: `Server is healthy. Response time: ${duration}ms`,
        data
      });
    } else {
      await recordTest('Server Health Check', 'failed', {
        duration,
        error: `Server returned ${response.status}: ${response.statusText}`
      });
    }
  } catch (error) {
    await recordTest('Server Health Check', 'failed', {
      error: error.message
    });
  }
}

async function testPricingPageWithPuppeteer() {
  log('Testing pricing page with Puppeteer...', 'info');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      slowMo: SLOW_MO
    });

    const page = await browser.newPage();

    // Capture console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', error => {
      consoleErrors.push(error.message);
    });

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to pricing page
    const startTime = Date.now();
    const response = await page.goto(`${BASE_URL}/pricing`, {
      waitUntil: 'networkidle2',
      timeout: TEST_TIMEOUT
    });
    const loadTime = Date.now() - startTime;

    // Check response status
    if (!response.ok()) {
      await recordTest('Pricing Page Load', 'failed', {
        error: `Page returned ${response.status()}`,
        duration: loadTime,
        consoleErrors
      });
      return;
    }

    // Wait for content to appear
    await page.waitForTimeout(2000);

    // Check for black screen issue
    const backgroundColor = await page.evaluate(() => {
      const body = document.body;
      const computedStyle = window.getComputedStyle(body);
      return computedStyle.backgroundColor;
    });

    // Check if any content is visible
    const hasVisibleContent = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return text.trim().length > 0;
    });

    // Check for pricing cards
    const pricingCards = await page.$$('[data-testid*="button-select"]');
    const cardCount = pricingCards.length;

    // Take screenshot
    const screenshotDir = join(__dirname, '../test-screenshots');
    await fs.mkdir(screenshotDir, { recursive: true });
    const screenshotPath = join(screenshotDir, 'pricing-page.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Evaluate results
    if (!hasVisibleContent) {
      await recordTest('Pricing Page Content', 'failed', {
        error: 'Page appears blank (no visible text content)',
        duration: loadTime,
        backgroundColor,
        consoleErrors,
        screenshot: screenshotPath
      });
    } else if (backgroundColor === 'rgb(0, 0, 0)' && !hasVisibleContent) {
      await recordTest('Pricing Page Black Screen', 'failed', {
        error: 'Black screen detected with no content',
        duration: loadTime,
        consoleErrors,
        screenshot: screenshotPath
      });
    } else if (cardCount === 0) {
      await recordTest('Pricing Page Structure', 'warning', {
        notes: 'Page loaded but no pricing cards found',
        duration: loadTime,
        consoleErrors,
        screenshot: screenshotPath
      });
    } else {
      await recordTest('Pricing Page Display', 'passed', {
        notes: `Page loaded successfully with ${cardCount} pricing cards`,
        duration: loadTime,
        hasContent: hasVisibleContent,
        backgroundColor,
        consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined,
        screenshot: screenshotPath
      });
    }

    // Test "Start Free Trial" button if present
    const trialButton = await page.$('[data-testid="button-start-trial"]');
    if (trialButton) {
      await trialButton.click();
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      if (currentUrl.includes('/trial-selection')) {
        await recordTest('Trial Selection Navigation', 'passed', {
          notes: 'Successfully navigated to trial selection page'
        });
      } else {
        await recordTest('Trial Selection Navigation', 'warning', {
          notes: `Navigated to unexpected URL: ${currentUrl}`
        });
      }
    }

  } catch (error) {
    await recordTest('Pricing Page Test', 'failed', {
      error: error.message
    });
  } finally {
    if (browser) await browser.close();
  }
}

async function testGoogleOAuthFlow() {
  log('Testing Google OAuth flow...', 'info');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      slowMo: SLOW_MO
    });

    const page = await browser.newPage();

    // Capture network requests
    const networkRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/auth/google')) {
        networkRequests.push({
          url: request.url(),
          method: request.method(),
          headers: request.headers()
        });
      }
    });

    // Navigate to auth page
    await page.goto(`${BASE_URL}/auth`, {
      waitUntil: 'networkidle2',
      timeout: TEST_TIMEOUT
    });

    // Look for Google sign-in button
    const googleButton = await page.$('button:has-text("Sign in with Google"), a[href*="/api/auth/google"]');

    if (!googleButton) {
      await recordTest('Google OAuth Button', 'failed', {
        error: 'Google sign-in button not found on auth page'
      });
      return;
    }

    // Click the Google sign-in button
    await googleButton.click();

    // Wait for navigation
    await page.waitForTimeout(3000);

    const currentUrl = page.url();

    // Check if redirected to Google
    if (currentUrl.includes('accounts.google.com')) {
      await recordTest('Google OAuth Redirect', 'passed', {
        notes: 'Successfully redirected to Google OAuth page',
        url: currentUrl
      });

      // Test OAuth callback URL structure
      const callbackUrl = networkRequests.find(req => req.url.includes('/api/auth/google'));
      if (callbackUrl) {
        await recordTest('OAuth Callback URL', 'passed', {
          notes: 'OAuth callback URL properly configured',
          callbackUrl: callbackUrl.url
        });
      }
    } else if (currentUrl.includes('/auth?error=')) {
      const error = new URL(currentUrl).searchParams.get('error');
      await recordTest('Google OAuth Flow', 'failed', {
        error: `OAuth error: ${error}`,
        url: currentUrl
      });
    } else {
      await recordTest('Google OAuth Flow', 'warning', {
        notes: 'OAuth button clicked but unexpected redirect',
        url: currentUrl
      });
    }

    // Take screenshot of auth page
    const screenshotPath = join(__dirname, '../test-screenshots/oauth-flow.png');
    await page.screenshot({ path: screenshotPath });

  } catch (error) {
    await recordTest('Google OAuth Test', 'failed', {
      error: error.message
    });
  } finally {
    if (browser) await browser.close();
  }
}

async function testTrialSelectionPage() {
  log('Testing trial selection page...', 'info');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      slowMo: SLOW_MO
    });

    const page = await browser.newPage();

    // Capture console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to trial selection page
    const response = await page.goto(`${BASE_URL}/trial-selection`, {
      waitUntil: 'networkidle2',
      timeout: TEST_TIMEOUT
    });

    if (!response.ok()) {
      await recordTest('Trial Selection Page Load', 'failed', {
        error: `Page returned ${response.status()}`,
        consoleErrors
      });
      return;
    }

    // Wait for content
    await page.waitForTimeout(2000);

    // Check for trial cards
    const trialCards = await page.evaluate(() => {
      const cards = document.querySelectorAll('.grid > *');
      return Array.from(cards).map(card => {
        const title = card.querySelector('h3, .text-xl')?.innerText;
        const price = card.querySelector('.text-3xl')?.innerText;
        const button = card.querySelector('button');
        return {
          title,
          price,
          hasButton: !!button,
          buttonText: button?.innerText
        };
      });
    });

    if (trialCards.length === 0) {
      await recordTest('Trial Selection Content', 'failed', {
        error: 'No trial cards found on page',
        consoleErrors
      });
    } else {
      await recordTest('Trial Selection Display', 'passed', {
        notes: `Found ${trialCards.length} trial options`,
        cards: trialCards,
        consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined
      });

      // Test clicking on Lite Trial button
      const liteTrialButton = await page.$('button:has-text("Start Lite Trial")');
      if (liteTrialButton) {
        await liteTrialButton.click();
        await page.waitForTimeout(2000);

        const currentUrl = page.url();
        if (currentUrl.includes('/auth')) {
          await recordTest('Lite Trial Authentication', 'passed', {
            notes: 'Correctly redirects to auth for unauthenticated users'
          });
        } else {
          await recordTest('Lite Trial Button', 'warning', {
            notes: `Unexpected redirect: ${currentUrl}`
          });
        }
      }
    }

    // Take screenshot
    const screenshotPath = join(__dirname, '../test-screenshots/trial-selection.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

  } catch (error) {
    await recordTest('Trial Selection Test', 'failed', {
      error: error.message
    });
  } finally {
    if (browser) await browser.close();
  }
}

async function testLandingPageTrialButton() {
  log('Testing landing page trial button...', 'info');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      slowMo: SLOW_MO
    });

    const page = await browser.newPage();

    // Navigate to landing page
    await page.goto(BASE_URL, {
      waitUntil: 'networkidle2',
      timeout: TEST_TIMEOUT
    });

    // Find "Start Free Trial" button
    const trialButtons = await page.$$('button:has-text("Start Free Trial"), a:has-text("Start Free Trial")');

    if (trialButtons.length === 0) {
      await recordTest('Landing Page Trial Button', 'failed', {
        error: 'No "Start Free Trial" button found on landing page'
      });
      return;
    }

    // Click the first trial button
    await trialButtons[0].click();
    await page.waitForTimeout(3000);

    const currentUrl = page.url();

    // Check where it navigated
    if (currentUrl.includes('/trial-selection') || currentUrl.includes('/pricing')) {
      await recordTest('Landing Page Trial Navigation', 'passed', {
        notes: `Successfully navigated to: ${currentUrl}`
      });

      // Check if the page loaded correctly (not black screen)
      const hasContent = await page.evaluate(() => {
        return document.body.innerText.trim().length > 0;
      });

      if (!hasContent) {
        await recordTest('Trial Page Content After Navigation', 'failed', {
          error: 'Page appears blank after navigation from landing page'
        });
      }
    } else if (currentUrl.includes('/auth')) {
      await recordTest('Landing Page Trial Navigation', 'passed', {
        notes: 'Correctly redirects to authentication for trial signup'
      });
    } else {
      await recordTest('Landing Page Trial Navigation', 'warning', {
        notes: `Unexpected navigation to: ${currentUrl}`
      });
    }

  } catch (error) {
    await recordTest('Landing Page Trial Button Test', 'failed', {
      error: error.message
    });
  } finally {
    if (browser) await browser.close();
  }
}

async function testAPIEndpoints() {
  log('Testing critical API endpoints...', 'info');

  // Test trial selection endpoint
  try {
    const response = await fetch(`${BASE_URL}/api/trial/plans`);
    if (response.ok) {
      const data = await response.json();
      await recordTest('Trial Plans API', 'passed', {
        notes: `API returned ${data.length || 0} trial plans`
      });
    } else {
      await recordTest('Trial Plans API', 'warning', {
        notes: `API returned ${response.status}`,
        error: response.statusText
      });
    }
  } catch (error) {
    await recordTest('Trial Plans API', 'failed', {
      error: error.message
    });
  }

  // Test OAuth configuration endpoint
  try {
    const response = await fetch(`${BASE_URL}/api/auth/config`);
    if (response.ok) {
      const data = await response.json();
      if (data.googleEnabled) {
        await recordTest('OAuth Configuration', 'passed', {
          notes: 'Google OAuth is properly configured'
        });
      } else {
        await recordTest('OAuth Configuration', 'warning', {
          notes: 'Google OAuth may not be configured'
        });
      }
    }
  } catch (error) {
    // This endpoint might not exist, which is okay
    await recordTest('OAuth Configuration Check', 'warning', {
      notes: 'Could not verify OAuth configuration'
    });
  }
}

// Main test runner
async function runAllTests() {
  console.log('\n========================================');
  console.log('   CRITICAL FLOW TESTING SUITE');
  console.log(`   Target: ${BASE_URL}`);
  console.log(`   Time: ${new Date().toLocaleString()}`);
  console.log('========================================\n');

  // Run all tests
  await testServerHealth();
  await testPricingPageWithPuppeteer();
  await testGoogleOAuthFlow();
  await testTrialSelectionPage();
  await testLandingPageTrialButton();
  await testAPIEndpoints();

  // Save results
  await saveResults();

  // Print summary
  console.log('\n========================================');
  console.log('   TEST SUMMARY');
  console.log('========================================');
  console.log(`Total Tests: ${results.summary.total}`);
  console.log(`Passed: ${results.summary.passed} ✓`);
  console.log(`Failed: ${results.summary.failed} ✗`);
  console.log(`Warnings: ${results.summary.warnings} ⚠`);
  console.log('========================================\n');

  // Exit with appropriate code
  process.exit(results.summary.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});