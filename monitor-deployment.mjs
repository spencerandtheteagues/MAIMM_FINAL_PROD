#!/usr/bin/env node

/**
 * Deployment Monitor Script
 * Monitors Render deployment and verifies when the fix is live
 */

import fetch from 'node-fetch';

const TEST_URL = 'https://myaimediamgr.onrender.com';
const CHECK_INTERVAL = 30000; // 30 seconds
const MAX_ATTEMPTS = 20; // 10 minutes max

async function checkDeploymentStatus() {
  try {
    // First, check if the service is up
    const healthResponse = await fetch(`${TEST_URL}/api/health`);

    // Get the main page to find the JS bundle
    const mainResponse = await fetch(TEST_URL);
    const html = await mainResponse.text();

    // Extract bundle filename
    const bundleMatch = html.match(/\/assets\/index-([^.]+)\.js/);
    if (!bundleMatch) {
      return { status: 'no_bundle', message: 'Could not find JS bundle' };
    }

    const bundleId = bundleMatch[1];
    const bundleUrl = `${TEST_URL}/assets/index-${bundleId}.js`;

    // Fetch and check the bundle content
    const bundleResponse = await fetch(bundleUrl);
    const bundleText = await bundleResponse.text();

    // Check for the problematic old code
    const hasOldCode = bundleText.includes("document.body.style.display='none'") ||
                      bundleText.includes('document.body.style.display="none"');

    // Check for the new safe code
    const hasNewCode = bundleText.includes("documentElement.style.opacity='0.999'") ||
                      bundleText.includes('documentElement.style.opacity="0.999"') ||
                      bundleText.includes('Emergency: body was hidden');

    if (hasNewCode && !hasOldCode) {
      return { status: 'deployed', bundleId, message: '✅ Fix is deployed!' };
    } else if (hasOldCode) {
      return { status: 'old_code', bundleId, message: '⏳ Still serving old code...' };
    } else {
      return { status: 'unknown', bundleId, message: '🔍 Checking bundle content...' };
    }

  } catch (error) {
    return { status: 'error', message: `Error: ${error.message}` };
  }
}

async function monitor() {
  console.log('========================================');
  console.log('DEPLOYMENT MONITOR');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('========================================\n');

  let attempts = 0;
  let lastBundleId = null;

  const checkLoop = setInterval(async () => {
    attempts++;

    console.log(`\n[${new Date().toTimeString().slice(0, 8)}] Check #${attempts}`);

    const result = await checkDeploymentStatus();
    console.log(`  Status: ${result.status}`);
    console.log(`  ${result.message}`);

    if (result.bundleId && result.bundleId !== lastBundleId) {
      console.log(`  📦 New bundle detected: ${result.bundleId}`);
      lastBundleId = result.bundleId;
    }

    if (result.status === 'deployed') {
      console.log('\n========================================');
      console.log('🎉 DEPLOYMENT SUCCESSFUL!');
      console.log('========================================');
      console.log('\nThe black screen fix has been deployed.');
      console.log('All pages should now be visible.');
      console.log('\nTest URLs:');
      console.log('  - https://myaimediamgr.onrender.com/pricing');
      console.log('  - https://myaimediamgr.onrender.com/trial-selection');
      console.log('  - https://myaimediamgr.onrender.com/trial');
      clearInterval(checkLoop);
      process.exit(0);
    }

    if (attempts >= MAX_ATTEMPTS) {
      console.log('\n========================================');
      console.log('⚠️  TIMEOUT');
      console.log('========================================');
      console.log('\nDeployment is taking longer than expected.');
      console.log('Please check Render dashboard for deployment status.');
      clearInterval(checkLoop);
      process.exit(1);
    }

  }, CHECK_INTERVAL);

  // Initial check immediately
  const initialResult = await checkDeploymentStatus();
  console.log(`Initial check:`);
  console.log(`  Status: ${initialResult.status}`);
  console.log(`  ${initialResult.message}`);
  if (initialResult.bundleId) {
    lastBundleId = initialResult.bundleId;
    console.log(`  Bundle ID: ${initialResult.bundleId}`);
  }

  if (initialResult.status === 'deployed') {
    clearInterval(checkLoop);
    console.log('\n✅ Fix is already deployed!');
    process.exit(0);
  }

  console.log('\n⏳ Monitoring deployment...');
  console.log('   Checking every 30 seconds...');
}

monitor().catch(console.error);