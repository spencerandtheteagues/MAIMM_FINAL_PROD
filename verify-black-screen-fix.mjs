#!/usr/bin/env node

/**
 * Black Screen Issue Verification Script
 * Specifically tests if the theme.ts fix resolves the display:none issue
 */

import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

const TEST_URL = 'https://myaimediamgr.onrender.com';

console.log('========================================');
console.log('BLACK SCREEN FIX VERIFICATION');
console.log(`Time: ${new Date().toISOString()}`);
console.log('========================================\n');

async function checkPageVisibility(path) {
  const url = `${TEST_URL}${path}`;
  console.log(`\nChecking: ${url}`);

  try {
    // Fetch the page
    const response = await fetch(url);
    const html = await response.text();

    // Check for the problematic theme code
    const hasOldThemeCode = html.includes("document.body.style.display = 'none'") ||
                            html.includes('document.body.style.display="none"');

    const hasNewThemeCode = html.includes("document.documentElement.style.opacity = '0.999'") ||
                            html.includes('document.documentElement.style.opacity="0.999"');

    // Parse HTML to check body visibility
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const bodyStyle = document.body ? document.body.getAttribute('style') : null;
    const isHidden = bodyStyle && bodyStyle.includes('display') && bodyStyle.includes('none');

    console.log(`  Status: ${response.status}`);
    console.log(`  Old theme code present: ${hasOldThemeCode ? '❌ YES (BAD)' : '✅ NO (GOOD)'}`);
    console.log(`  New theme code present: ${hasNewThemeCode ? '✅ YES (GOOD)' : '⚠️  NO'}`);
    console.log(`  Body visibility: ${isHidden ? '❌ HIDDEN' : '✅ VISIBLE'}`);

    // Fetch the JavaScript bundle to check if it contains the fix
    const scriptTags = [...document.querySelectorAll('script[src*="assets"]')];
    if (scriptTags.length > 0) {
      const bundleUrl = new URL(scriptTags[0].src, TEST_URL).href;
      console.log(`  Checking bundle: ${bundleUrl.split('/').pop()}`);

      const bundleResponse = await fetch(bundleUrl);
      const bundleText = await bundleResponse.text();

      const bundleHasOldCode = bundleText.includes("document.body.style.display='none'") ||
                               bundleText.includes('document.body.style.display="none"');

      const bundleHasNewCode = bundleText.includes("documentElement.style.opacity='0.999'") ||
                               bundleText.includes('documentElement.style.opacity="0.999"');

      console.log(`  Bundle has old code: ${bundleHasOldCode ? '❌ YES (BAD)' : '✅ NO (GOOD)'}`);
      console.log(`  Bundle has new code: ${bundleHasNewCode ? '✅ YES (GOOD)' : '⚠️  NO'}`);

      return {
        path,
        isFixed: !hasOldThemeCode && !bundleHasOldCode && !isHidden,
        hasNewCode: hasNewThemeCode || bundleHasNewCode,
        bodyVisible: !isHidden
      };
    }

    return {
      path,
      isFixed: !hasOldThemeCode && !isHidden,
      hasNewCode: hasNewThemeCode,
      bodyVisible: !isHidden
    };

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return { path, error: error.message };
  }
}

async function testInteractiveFlow() {
  console.log('\n========================================');
  console.log('INTERACTIVE FLOW TEST');
  console.log('========================================');

  // Test landing page button
  try {
    const response = await fetch(TEST_URL);
    const html = await response.text();
    const dom = new JSDOM(html);
    const hasTrialButton = html.includes('/trial-selection') || html.includes('Choose Your Plan');

    console.log('\nLanding Page:');
    console.log(`  Has trial/pricing button: ${hasTrialButton ? '✅' : '❌'}`);

  } catch (error) {
    console.log(`  ❌ Error testing landing page: ${error.message}`);
  }

  // Test OAuth redirect
  try {
    const oauthResponse = await fetch(`${TEST_URL}/api/auth/google`, {
      redirect: 'manual'
    });

    const isRedirect = oauthResponse.status === 302 || oauthResponse.status === 301;
    const location = oauthResponse.headers.get('location');
    const isGoogleAuth = location && location.includes('accounts.google.com');

    console.log('\nOAuth Flow:');
    console.log(`  Redirects properly: ${isRedirect ? '✅' : '❌'}`);
    console.log(`  Goes to Google: ${isGoogleAuth ? '✅' : '❌'}`);

  } catch (error) {
    console.log(`  ❌ Error testing OAuth: ${error.message}`);
  }
}

async function main() {
  // Test critical pages
  const results = await Promise.all([
    checkPageVisibility('/'),
    checkPageVisibility('/pricing'),
    checkPageVisibility('/trial-selection'),
    checkPageVisibility('/trial'),
    checkPageVisibility('/auth')
  ]);

  // Test interactive flows
  await testInteractiveFlow();

  // Summary
  console.log('\n========================================');
  console.log('VERIFICATION SUMMARY');
  console.log('========================================');

  const allFixed = results.every(r => r.isFixed && r.bodyVisible);
  const hasNewCode = results.some(r => r.hasNewCode);

  if (allFixed) {
    console.log('\n✅ BLACK SCREEN ISSUE IS FIXED!');
    console.log('   All pages are visible and old problematic code is removed.');
  } else {
    console.log('\n⚠️  FIX NOT FULLY DEPLOYED YET');
    console.log('   The fix may still be building on Render.');

    const brokenPages = results.filter(r => !r.bodyVisible);
    if (brokenPages.length > 0) {
      console.log('\n   Pages still showing black screen:');
      brokenPages.forEach(p => console.log(`     - ${p.path}`));
    }
  }

  if (hasNewCode) {
    console.log('\n✅ New safe theme code detected in bundle');
  } else {
    console.log('\n⚠️  New theme code not yet detected - deployment may be in progress');
  }

  console.log('\n🔄 If fix is not deployed yet, wait 2-3 minutes and run again.');
  console.log('   Render typically takes 2-5 minutes to build and deploy.');

  console.log('\n========================================\n');

  // Return exit code based on fix status
  process.exit(allFixed ? 0 : 1);
}

main().catch(console.error);