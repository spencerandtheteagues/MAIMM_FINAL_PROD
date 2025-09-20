#!/usr/bin/env node

/**
 * Critical Issue Testing Script
 * Tests the pricing page, trial selection, and OAuth flow
 */

import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

const BASE_URL = 'https://myaimediamgr.onrender.com';
const LOCAL_URL = 'http://localhost:3000';

// Use command line arg to determine which URL to test
const TEST_URL = process.argv[2] === '--local' ? LOCAL_URL : BASE_URL;

console.log('====================================');
console.log('Critical Issue Testing Report');
console.log(`Testing: ${TEST_URL}`);
console.log(`Time: ${new Date().toISOString()}`);
console.log('====================================\n');

async function testPage(path, description) {
  const url = `${TEST_URL}${path}`;
  console.log(`\n📍 Testing: ${description}`);
  console.log(`   URL: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });

    const status = response.status;
    const contentType = response.headers.get('content-type');
    const html = await response.text();

    console.log(`   Status: ${status}`);
    console.log(`   Content-Type: ${contentType}`);
    console.log(`   HTML Length: ${html.length} bytes`);

    // Parse HTML to check for issues
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Check if page has visible content
    const hasContent = html.length > 500;
    const hasRoot = document.getElementById('root');
    const bodyStyle = document.body ? document.body.getAttribute('style') : null;
    const htmlStyle = document.documentElement ? document.documentElement.getAttribute('style') : null;

    // Check for React app indicators
    const hasReactScript = html.includes('main.tsx') || html.includes('main.jsx');
    const hasThemeScript = html.includes('data-theme');

    // Look for black screen indicators
    const isBodyHidden = bodyStyle && (bodyStyle.includes('display:none') || bodyStyle.includes('display: none'));
    const isHtmlHidden = htmlStyle && (htmlStyle.includes('display:none') || htmlStyle.includes('display: none'));

    console.log(`   Has Content: ${hasContent ? '✅' : '❌'}`);
    console.log(`   Has Root Element: ${hasRoot ? '✅' : '❌'}`);
    console.log(`   React App Loaded: ${hasReactScript ? '✅' : '❌'}`);
    console.log(`   Theme Script Present: ${hasThemeScript ? '✅' : '❌'}`);

    if (isBodyHidden || isHtmlHidden) {
      console.log(`   ⚠️  BLACK SCREEN DETECTED!`);
      console.log(`      Body Hidden: ${isBodyHidden}`);
      console.log(`      HTML Hidden: ${isHtmlHidden}`);
      console.log(`      Body Style: ${bodyStyle}`);
      console.log(`      HTML Style: ${htmlStyle}`);
    }

    // Extract theme from page
    const themeMatch = html.match(/data-theme['"]=["']([^"']+)["']/);
    if (themeMatch) {
      console.log(`   Theme: ${themeMatch[1]}`);
    }

    // Look for error messages
    if (html.includes('error') || html.includes('Error')) {
      const errors = [...document.querySelectorAll('*')].filter(el =>
        el.textContent.toLowerCase().includes('error')
      ).slice(0, 3);
      if (errors.length > 0) {
        console.log(`   ⚠️  Errors found:`);
        errors.forEach(err => {
          const text = err.textContent.trim().substring(0, 100);
          if (text) console.log(`      - ${text}`);
        });
      }
    }

    return { success: true, hasContent, isHidden: isBodyHidden || isHtmlHidden };

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testOAuthEndpoint() {
  console.log('\n📍 Testing: OAuth Google Endpoint');
  const url = `${TEST_URL}/api/auth/google`;
  console.log(`   URL: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual', // Don't follow redirects
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });

    const status = response.status;
    const location = response.headers.get('location');

    console.log(`   Status: ${status}`);

    if (status === 302 || status === 301) {
      console.log(`   ✅ OAuth redirect detected`);
      console.log(`   Redirect to: ${location ? location.substring(0, 50) + '...' : 'N/A'}`);

      if (location && location.includes('accounts.google.com')) {
        console.log(`   ✅ Correctly redirecting to Google OAuth`);
      } else if (location && location.includes('error')) {
        console.log(`   ⚠️  Redirect contains error`);
      }
    } else {
      console.log(`   ⚠️  Unexpected status code (expected 302)`);
    }

    return { success: true, status, location };

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testAPIEndpoint(path, description) {
  console.log(`\n📍 Testing: ${description}`);
  const url = `${TEST_URL}${path}`;
  console.log(`   URL: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      }
    });

    const status = response.status;
    const contentType = response.headers.get('content-type');

    console.log(`   Status: ${status}`);
    console.log(`   Content-Type: ${contentType}`);

    if (contentType && contentType.includes('json')) {
      const json = await response.json();
      console.log(`   Response: ${JSON.stringify(json).substring(0, 100)}`);
    }

    return { success: status < 500, status };

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Run all tests
async function runTests() {
  const results = {
    pages: {},
    api: {},
    oauth: {}
  };

  // Test critical pages
  console.log('\n🔍 TESTING CRITICAL PAGES');
  console.log('==========================');

  results.pages.landing = await testPage('/', 'Landing Page');
  results.pages.pricing = await testPage('/pricing', 'Pricing Page');
  results.pages.trialSelection = await testPage('/trial-selection', 'Trial Selection Page');
  results.pages.trial = await testPage('/trial', 'Trial Page');
  results.pages.auth = await testPage('/auth', 'Auth Page');

  // Test API endpoints
  console.log('\n\n🔍 TESTING API ENDPOINTS');
  console.log('========================');

  results.api.health = await testAPIEndpoint('/api/health', 'Health Check');
  results.api.user = await testAPIEndpoint('/api/user', 'User Endpoint (unauthenticated)');

  // Test OAuth
  console.log('\n\n🔍 TESTING OAUTH');
  console.log('================');

  results.oauth.google = await testOAuthEndpoint();

  // Summary
  console.log('\n\n====================================');
  console.log('📊 TEST SUMMARY');
  console.log('====================================');

  let blackScreens = [];
  let failures = [];

  // Check for black screens
  Object.entries(results.pages).forEach(([name, result]) => {
    if (result.isHidden) {
      blackScreens.push(name);
    }
    if (!result.success) {
      failures.push(`Page: ${name}`);
    }
  });

  Object.entries(results.api).forEach(([name, result]) => {
    if (!result.success) {
      failures.push(`API: ${name}`);
    }
  });

  if (blackScreens.length > 0) {
    console.log('\n🚨 BLACK SCREENS DETECTED:');
    blackScreens.forEach(page => {
      console.log(`   - ${page}`);
    });
  }

  if (failures.length > 0) {
    console.log('\n❌ FAILURES:');
    failures.forEach(failure => {
      console.log(`   - ${failure}`);
    });
  }

  if (blackScreens.length === 0 && failures.length === 0) {
    console.log('\n✅ All tests passed!');
  }

  console.log('\n\n🔧 RECOMMENDATIONS:');
  console.log('===================');

  if (blackScreens.includes('pricing') || blackScreens.includes('trialSelection')) {
    console.log('1. BLACK SCREEN FIX NEEDED:');
    console.log('   - The theme.ts file was causing display:none on body');
    console.log('   - Fix has been applied but needs deployment');
    console.log('   - Deploy the fix in client/src/lib/theme.ts');
  }

  if (results.oauth.google && !results.oauth.google.location?.includes('accounts.google.com')) {
    console.log('2. OAUTH CONFIGURATION:');
    console.log('   - Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars');
    console.log('   - Verify callback URL is correctly configured');
  }

  console.log('\n🚀 DEPLOYMENT COMMAND:');
  console.log('   git add -A && git commit -m "fix: resolve black screen issue in theme.ts" && git push');

  console.log('\n====================================\n');
}

// Run tests
runTests().catch(console.error);