#!/usr/bin/env node
/**
 * End-to-End User Journey Integration Tests
 * Tests complete user flows from signup through trial selection
 */

import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import fetch from 'node-fetch';
import crypto from 'crypto';

const BASE_URL = process.env.TEST_URL || 'https://myaimediamgr.onrender.com';
const TEST_TIMEOUT = 60000;

class UserJourneyTests {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.results = [];
    this.testUser = {
      email: `test-${crypto.randomBytes(4).toString('hex')}@example.com`,
      password: 'TestPass123!',
      name: 'Test User'
    };
  }

  async setup() {
    this.browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'MyAiMediaMgr-Test-Agent/1.0'
    });
    this.page = await this.context.newPage();

    // Set up request/response interceptors
    this.page.on('request', request => {
      if (request.url().includes('/api/')) {
        console.log(`→ API Request: ${request.method()} ${request.url()}`);
      }
    });

    this.page.on('response', response => {
      if (response.url().includes('/api/') && response.status() >= 400) {
        console.error(`← API Error ${response.status()}: ${response.url()}`);
      }
    });

    // Capture console errors
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        this.recordConsoleError(msg.text());
      }
    });

    this.page.on('pageerror', error => {
      this.recordPageError(error.message);
    });
  }

  async teardown() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  recordConsoleError(error) {
    console.error(`[CONSOLE ERROR] ${error}`);
    this.results.push({
      type: 'console_error',
      message: error,
      timestamp: new Date().toISOString()
    });
  }

  recordPageError(error) {
    console.error(`[PAGE ERROR] ${error}`);
    this.results.push({
      type: 'page_error',
      message: error,
      timestamp: new Date().toISOString()
    });
  }

  async recordTest(name, status, details = {}) {
    const result = {
      name,
      status,
      timestamp: new Date().toISOString(),
      ...details
    };
    this.results.push(result);
    console.log(`${status === 'passed' ? '✓' : '✗'} ${name}`);
    if (details.error) console.error(`  Error: ${details.error}`);
    return result;
  }

  async takeScreenshot(name) {
    const path = `./test-screenshots/${name}-${Date.now()}.png`;
    await this.page.screenshot({ path, fullPage: true });
    return path;
  }

  // Test Cases

  async testLandingPageLoad() {
    console.log('\n=== Testing Landing Page Load ===');

    const startTime = Date.now();
    const response = await this.page.goto(BASE_URL, {
      waitUntil: 'networkidle',
      timeout: TEST_TIMEOUT
    });

    const loadTime = Date.now() - startTime;

    if (!response.ok()) {
      return this.recordTest('Landing Page Load', 'failed', {
        error: `Page returned ${response.status()}`,
        loadTime
      });
    }

    // Check for critical elements
    const hasHeroSection = await this.page.locator('h1').count() > 0;
    const hasTrialButton = await this.page.locator('text=/Start.*Trial/i').count() > 0;
    const hasSignInButton = await this.page.locator('text=/Sign.*In/i').count() > 0;

    if (!hasHeroSection || !hasTrialButton) {
      const screenshot = await this.takeScreenshot('landing-page-missing-elements');
      return this.recordTest('Landing Page Structure', 'failed', {
        error: 'Missing critical page elements',
        screenshot,
        hasHeroSection,
        hasTrialButton,
        hasSignInButton
      });
    }

    return this.recordTest('Landing Page Load', 'passed', {
      loadTime,
      hasHeroSection,
      hasTrialButton,
      hasSignInButton
    });
  }

  async testStartFreeTrialFlow() {
    console.log('\n=== Testing Start Free Trial Flow ===');

    // Click Start Free Trial button
    const trialButton = await this.page.locator('button:has-text("Start Free Trial"), a:has-text("Start Free Trial")').first();

    if (!trialButton) {
      return this.recordTest('Start Free Trial Button', 'failed', {
        error: 'Trial button not found'
      });
    }

    await trialButton.click();
    await this.page.waitForLoadState('networkidle');

    const currentUrl = this.page.url();

    // Check if navigated to expected page
    if (currentUrl.includes('/trial-selection') || currentUrl.includes('/pricing')) {
      // Check if page has content (not black screen)
      await this.page.waitForTimeout(2000);

      const backgroundColor = await this.page.evaluate(() => {
        return window.getComputedStyle(document.body).backgroundColor;
      });

      const hasVisibleContent = await this.page.evaluate(() => {
        return document.body.innerText.trim().length > 0;
      });

      if (!hasVisibleContent || backgroundColor === 'rgb(0, 0, 0)') {
        const screenshot = await this.takeScreenshot('black-screen-issue');
        return this.recordTest('Trial Page Display', 'failed', {
          error: 'Black screen or no content displayed',
          backgroundColor,
          hasVisibleContent,
          screenshot,
          url: currentUrl
        });
      }

      // Count trial options
      const trialCards = await this.page.locator('.grid > *').count();

      return this.recordTest('Start Free Trial Navigation', 'passed', {
        url: currentUrl,
        trialCards,
        hasVisibleContent,
        backgroundColor
      });
    } else if (currentUrl.includes('/auth')) {
      return this.recordTest('Start Free Trial Navigation', 'passed', {
        note: 'Correctly redirected to authentication',
        url: currentUrl
      });
    } else {
      return this.recordTest('Start Free Trial Navigation', 'warning', {
        note: 'Unexpected navigation',
        url: currentUrl
      });
    }
  }

  async testGoogleOAuthInitiation() {
    console.log('\n=== Testing Google OAuth Initiation ===');

    // Navigate to auth page
    await this.page.goto(`${BASE_URL}/auth`, {
      waitUntil: 'networkidle'
    });

    // Find Google sign-in button
    const googleButton = await this.page.locator('button:has-text("Sign in with Google"), a[href*="/api/auth/google"]').first();

    if (!googleButton) {
      return this.recordTest('Google OAuth Button', 'failed', {
        error: 'Google sign-in button not found'
      });
    }

    // Click and wait for navigation
    const [response] = await Promise.all([
      this.page.waitForNavigation({ timeout: 10000 }).catch(() => null),
      googleButton.click()
    ]);

    const currentUrl = this.page.url();

    if (currentUrl.includes('accounts.google.com')) {
      return this.recordTest('Google OAuth Initiation', 'passed', {
        note: 'Successfully redirected to Google',
        url: currentUrl
      });
    } else if (currentUrl.includes('error')) {
      const error = new URL(currentUrl).searchParams.get('error');
      return this.recordTest('Google OAuth Initiation', 'failed', {
        error: `OAuth error: ${error}`,
        url: currentUrl
      });
    } else {
      return this.recordTest('Google OAuth Initiation', 'warning', {
        note: 'Unexpected OAuth behavior',
        url: currentUrl
      });
    }
  }

  async testPricingPageNavigation() {
    console.log('\n=== Testing Pricing Page Navigation ===');

    await this.page.goto(`${BASE_URL}/pricing`, {
      waitUntil: 'networkidle',
      timeout: TEST_TIMEOUT
    });

    // Wait for potential React rendering
    await this.page.waitForTimeout(3000);

    // Check page visibility
    const isVisible = await this.page.evaluate(() => {
      const body = document.body;
      const hasContent = body.innerText.trim().length > 0;
      const computedStyle = window.getComputedStyle(body);
      const isHidden = computedStyle.display === 'none' || computedStyle.visibility === 'hidden';
      return hasContent && !isHidden;
    });

    if (!isVisible) {
      const screenshot = await this.takeScreenshot('pricing-page-blank');

      // Get detailed diagnostics
      const diagnostics = await this.page.evaluate(() => {
        return {
          bodyHTML: document.body.innerHTML.substring(0, 500),
          bodyText: document.body.innerText.substring(0, 200),
          backgroundColor: window.getComputedStyle(document.body).backgroundColor,
          display: window.getComputedStyle(document.body).display,
          visibility: window.getComputedStyle(document.body).visibility,
          rootElement: document.getElementById('root')?.innerHTML.substring(0, 200)
        };
      });

      return this.recordTest('Pricing Page Display', 'failed', {
        error: 'Page not visible or blank',
        screenshot,
        diagnostics
      });
    }

    // Check for pricing cards
    const pricingPlans = await this.page.locator('[data-testid*="button-select"]').count();
    const hasTrialButton = await this.page.locator('[data-testid="button-start-trial"]').count() > 0;

    return this.recordTest('Pricing Page Display', 'passed', {
      pricingPlans,
      hasTrialButton,
      isVisible
    });
  }

  async testTrialSelectionOptions() {
    console.log('\n=== Testing Trial Selection Options ===');

    await this.page.goto(`${BASE_URL}/trial-selection`, {
      waitUntil: 'networkidle'
    });

    await this.page.waitForTimeout(2000);

    // Check for trial cards
    const trialOptions = await this.page.evaluate(() => {
      const cards = document.querySelectorAll('.grid > div');
      return Array.from(cards).map(card => {
        const title = card.querySelector('h3, .text-xl')?.textContent;
        const price = card.querySelector('.text-3xl')?.textContent;
        const button = card.querySelector('button');
        return {
          title: title?.trim(),
          price: price?.trim(),
          buttonText: button?.textContent?.trim()
        };
      });
    });

    if (trialOptions.length === 0) {
      const screenshot = await this.takeScreenshot('trial-selection-empty');
      return this.recordTest('Trial Selection Options', 'failed', {
        error: 'No trial options found',
        screenshot
      });
    }

    // Verify expected trial options exist
    const hasLiteTrial = trialOptions.some(opt => opt.title?.includes('Lite'));
    const hasProTrial = trialOptions.some(opt => opt.title?.includes('Pro'));

    if (!hasLiteTrial) {
      return this.recordTest('Trial Selection Options', 'warning', {
        note: 'Lite trial option not found',
        options: trialOptions
      });
    }

    return this.recordTest('Trial Selection Options', 'passed', {
      optionCount: trialOptions.length,
      hasLiteTrial,
      hasProTrial,
      options: trialOptions
    });
  }

  async testLiteTrialSelection() {
    console.log('\n=== Testing Lite Trial Selection ===');

    // Ensure we're on trial selection page
    if (!this.page.url().includes('/trial-selection')) {
      await this.page.goto(`${BASE_URL}/trial-selection`, {
        waitUntil: 'networkidle'
      });
    }

    // Find and click Lite Trial button
    const liteButton = await this.page.locator('button:has-text("Start Lite Trial")').first();

    if (!liteButton) {
      return this.recordTest('Lite Trial Button', 'failed', {
        error: 'Lite trial button not found'
      });
    }

    await liteButton.click();
    await this.page.waitForLoadState('networkidle');

    const currentUrl = this.page.url();

    // Check where user was redirected
    if (currentUrl.includes('/auth')) {
      return this.recordTest('Lite Trial Selection', 'passed', {
        note: 'Correctly redirected to auth for unauthenticated user',
        url: currentUrl
      });
    } else if (currentUrl.includes('/')) {
      return this.recordTest('Lite Trial Selection', 'passed', {
        note: 'Trial activated for authenticated user',
        url: currentUrl
      });
    } else {
      return this.recordTest('Lite Trial Selection', 'warning', {
        note: 'Unexpected redirect after trial selection',
        url: currentUrl
      });
    }
  }

  async testMobileResponsiveness() {
    console.log('\n=== Testing Mobile Responsiveness ===');

    // Set mobile viewport
    await this.page.setViewportSize({ width: 375, height: 667 });

    // Test landing page on mobile
    await this.page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const mobileLandingOk = await this.page.evaluate(() => {
      const body = document.body;
      return body.scrollWidth <= window.innerWidth; // No horizontal scroll
    });

    // Test pricing page on mobile
    await this.page.goto(`${BASE_URL}/pricing`, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(2000);

    const mobilePricingOk = await this.page.evaluate(() => {
      const body = document.body;
      const hasContent = body.innerText.trim().length > 0;
      const noHorizontalScroll = body.scrollWidth <= window.innerWidth;
      return hasContent && noHorizontalScroll;
    });

    // Reset viewport
    await this.page.setViewportSize({ width: 1920, height: 1080 });

    return this.recordTest('Mobile Responsiveness',
      mobileLandingOk && mobilePricingOk ? 'passed' : 'warning', {
      mobileLandingOk,
      mobilePricingOk
    });
  }

  async testAPIHealthChecks() {
    console.log('\n=== Testing API Health Checks ===');

    const endpoints = [
      { path: '/api/health', name: 'Health Check' },
      { path: '/api/trial/plans', name: 'Trial Plans' }
    ];

    const results = [];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${BASE_URL}${endpoint.path}`);
        results.push({
          name: endpoint.name,
          path: endpoint.path,
          status: response.status,
          ok: response.ok
        });
      } catch (error) {
        results.push({
          name: endpoint.name,
          path: endpoint.path,
          error: error.message
        });
      }
    }

    const allHealthy = results.every(r => r.ok || r.status === 401); // 401 is ok for protected endpoints

    return this.recordTest('API Health Checks',
      allHealthy ? 'passed' : 'warning', {
      endpoints: results
    });
  }

  async runAllTests() {
    console.log('\n========================================');
    console.log('   USER JOURNEY INTEGRATION TESTS');
    console.log(`   Target: ${BASE_URL}`);
    console.log('========================================\n');

    const testResults = [];

    try {
      await this.setup();

      // Run tests in sequence
      testResults.push(await this.testLandingPageLoad());
      testResults.push(await this.testStartFreeTrialFlow());
      testResults.push(await this.testGoogleOAuthInitiation());
      testResults.push(await this.testPricingPageNavigation());
      testResults.push(await this.testTrialSelectionOptions());
      testResults.push(await this.testLiteTrialSelection());
      testResults.push(await this.testMobileResponsiveness());
      testResults.push(await this.testAPIHealthChecks());

    } catch (error) {
      console.error('Test suite error:', error);
      testResults.push({
        name: 'Test Suite',
        status: 'failed',
        error: error.message
      });
    } finally {
      await this.teardown();
    }

    // Generate summary
    const summary = {
      total: testResults.length,
      passed: testResults.filter(r => r.status === 'passed').length,
      failed: testResults.filter(r => r.status === 'failed').length,
      warnings: testResults.filter(r => r.status === 'warning').length
    };

    console.log('\n========================================');
    console.log('   TEST SUMMARY');
    console.log('========================================');
    console.log(`Total: ${summary.total}`);
    console.log(`Passed: ${summary.passed} ✓`);
    console.log(`Failed: ${summary.failed} ✗`);
    console.log(`Warnings: ${summary.warnings} ⚠`);
    console.log('========================================\n');

    return {
      results: testResults,
      summary,
      timestamp: new Date().toISOString()
    };
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new UserJourneyTests();
  tester.runAllTests()
    .then(results => {
      process.exit(results.summary.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default UserJourneyTests;