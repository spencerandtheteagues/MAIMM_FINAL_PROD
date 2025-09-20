#!/usr/bin/env node

/**
 * Comprehensive OAuth Flow Testing Script
 * Tests Google OAuth authorization, trial selection redirect, and middleware bypass
 */

import fetch from 'node-fetch';
import https from 'https';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'fetch-cookie';
import chalk from 'chalk';
import { config } from 'dotenv';

// Load environment variables
config();

const BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://myaimediamgr.onrender.com';
const LOCAL_URL = 'http://localhost:5000';
const IS_PRODUCTION = BASE_URL.includes('onrender.com');

// Use fetch with cookie support
const cookieJar = new CookieJar();
const fetchWithCookies = wrapper(fetch, cookieJar);

// Test results storage
const testResults = {
  timestamp: new Date().toISOString(),
  environment: IS_PRODUCTION ? 'production' : 'local',
  baseUrl: IS_PRODUCTION ? BASE_URL : LOCAL_URL,
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  }
};

// HTTPS agent for handling SSL in production
const httpsAgent = new https.Agent({
  rejectUnauthorized: !IS_PRODUCTION // Allow self-signed certs in dev
});

// Test utilities
function logTest(name, status, details = {}) {
  const statusSymbol = status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : '❌';
  const statusColor = status === 'pass' ? chalk.green : status === 'warn' ? chalk.yellow : chalk.red;

  console.log(`${statusSymbol} ${statusColor(name)}`);
  if (details.message) {
    console.log(`   ${chalk.gray(details.message)}`);
  }

  testResults.tests.push({
    name,
    status,
    details,
    timestamp: new Date().toISOString()
  });

  testResults.summary.total++;
  if (status === 'pass') testResults.summary.passed++;
  else if (status === 'fail') testResults.summary.failed++;
  else if (status === 'warn') testResults.summary.warnings++;
}

// Test 1: OAuth Initiation Endpoint
async function testOAuthInitiation() {
  console.log(chalk.blue('\n🔍 Test 1: OAuth Initiation Endpoint'));

  try {
    const response = await fetchWithCookies(`${IS_PRODUCTION ? BASE_URL : LOCAL_URL}/api/auth/google`, {
      method: 'GET',
      redirect: 'manual',
      agent: IS_PRODUCTION ? httpsAgent : undefined
    });

    const location = response.headers.get('location');
    const cookies = response.headers.get('set-cookie');

    // Check if OAuth redirect is properly formed
    if (response.status === 302 || response.status === 303) {
      if (location && location.includes('accounts.google.com')) {
        logTest('OAuth initiation redirects to Google', 'pass', {
          message: 'Redirect URL contains Google OAuth endpoint',
          redirectUrl: location.substring(0, 100) + '...'
        });

        // Check for state parameter
        if (location.includes('state=')) {
          logTest('OAuth state parameter present', 'pass', {
            message: 'Security state parameter included in redirect'
          });
        } else {
          logTest('OAuth state parameter present', 'fail', {
            message: 'Missing state parameter for CSRF protection'
          });
        }

        // Check for oauth_state cookie
        if (cookies && cookies.includes('oauth_state')) {
          logTest('OAuth state cookie set', 'pass', {
            message: 'Server set oauth_state cookie for verification'
          });
        } else {
          logTest('OAuth state cookie set', 'warn', {
            message: 'oauth_state cookie not found in response'
          });
        }
      } else {
        logTest('OAuth initiation redirects to Google', 'fail', {
          message: 'Redirect URL does not point to Google OAuth',
          actualLocation: location
        });
      }
    } else if (response.status === 500 || response.status === 401) {
      // Check for missing credentials error
      const body = await response.text();
      if (body.includes('GOOGLE_CLIENT_ID') || body.includes('client_id')) {
        logTest('OAuth credentials check', 'warn', {
          message: 'OAuth credentials not configured (expected in production)',
          status: response.status
        });
      } else {
        logTest('OAuth initiation', 'fail', {
          message: 'Server error during OAuth initiation',
          status: response.status,
          error: body.substring(0, 200)
        });
      }
    } else {
      logTest('OAuth initiation', 'fail', {
        message: `Unexpected response status: ${response.status}`,
        headers: Object.fromEntries(response.headers)
      });
    }
  } catch (error) {
    logTest('OAuth initiation', 'fail', {
      message: 'Failed to connect to OAuth endpoint',
      error: error.message
    });
  }
}

// Test 2: OAuth Callback Handling
async function testOAuthCallback() {
  console.log(chalk.blue('\n🔍 Test 2: OAuth Callback Handling'));

  try {
    // Simulate OAuth callback with test parameters
    const testState = 'test_state_123';
    const testCode = 'test_auth_code';

    // First set the oauth_state cookie
    await fetchWithCookies(`${IS_PRODUCTION ? BASE_URL : LOCAL_URL}/api/auth/google`, {
      method: 'GET',
      redirect: 'manual',
      agent: IS_PRODUCTION ? httpsAgent : undefined
    });

    // Test callback without matching state
    const response = await fetchWithCookies(
      `${IS_PRODUCTION ? BASE_URL : LOCAL_URL}/api/auth/google/callback?code=${testCode}&state=wrong_state`,
      {
        method: 'GET',
        redirect: 'manual',
        agent: IS_PRODUCTION ? httpsAgent : undefined
      }
    );

    if (response.status === 302 || response.status === 303) {
      const location = response.headers.get('location');

      if (location && location.includes('error=state_mismatch')) {
        logTest('OAuth state validation', 'pass', {
          message: 'Server correctly rejects mismatched state parameter'
        });
      } else if (location && location.includes('error=')) {
        logTest('OAuth callback error handling', 'pass', {
          message: 'Server redirects with error parameter',
          errorType: location.match(/error=([^&]+)/)?.[1]
        });
      } else {
        logTest('OAuth callback validation', 'warn', {
          message: 'Callback processed but error handling unclear',
          redirectTo: location
        });
      }
    } else {
      const body = await response.text();
      if (body.includes('state_mismatch') || body.includes('Invalid state')) {
        logTest('OAuth state validation', 'pass', {
          message: 'Server returns error for state mismatch',
          responseStatus: response.status
        });
      } else {
        logTest('OAuth callback handling', 'warn', {
          message: 'Unexpected response to invalid callback',
          status: response.status,
          bodySnippet: body.substring(0, 200)
        });
      }
    }
  } catch (error) {
    logTest('OAuth callback handling', 'fail', {
      message: 'Failed to test OAuth callback',
      error: error.message
    });
  }
}

// Test 3: Trial Selection Middleware Bypass
async function testMiddlewareBypass() {
  console.log(chalk.blue('\n🔍 Test 3: Trial Selection Middleware Bypass'));

  try {
    // Test that OAuth endpoints bypass trial selection middleware
    const oauthEndpoints = [
      '/api/auth/google',
      '/api/auth/google/callback',
      '/api/auth/logout'
    ];

    for (const endpoint of oauthEndpoints) {
      const response = await fetchWithCookies(`${IS_PRODUCTION ? BASE_URL : LOCAL_URL}${endpoint}`, {
        method: endpoint.includes('logout') ? 'POST' : 'GET',
        redirect: 'manual',
        agent: IS_PRODUCTION ? httpsAgent : undefined
      });

      // Check that we don't get trial selection error (403)
      if (response.status !== 403) {
        logTest(`Middleware bypass for ${endpoint}`, 'pass', {
          message: 'Endpoint accessible without trial selection block',
          actualStatus: response.status
        });
      } else {
        const body = await response.text();
        if (body.includes('needsTrialSelection')) {
          logTest(`Middleware bypass for ${endpoint}`, 'fail', {
            message: 'Endpoint blocked by trial selection middleware',
            status: 403
          });
        } else {
          logTest(`Middleware bypass for ${endpoint}`, 'warn', {
            message: 'Endpoint returned 403 but not for trial selection',
            bodySnippet: body.substring(0, 100)
          });
        }
      }
    }
  } catch (error) {
    logTest('Middleware bypass test', 'fail', {
      message: 'Failed to test middleware bypass',
      error: error.message
    });
  }
}

// Test 4: Trial Redirection Logic
async function testTrialRedirection() {
  console.log(chalk.blue('\n🔍 Test 4: Trial Redirection Logic'));

  try {
    // Test user endpoint to check trial selection flag handling
    const response = await fetchWithCookies(`${IS_PRODUCTION ? BASE_URL : LOCAL_URL}/api/user`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      agent: IS_PRODUCTION ? httpsAgent : undefined
    });

    if (response.status === 401) {
      logTest('Unauthenticated user handling', 'pass', {
        message: 'Server correctly returns 401 for unauthenticated requests'
      });
    } else if (response.status === 200) {
      const userData = await response.json();

      if (userData.needsTrialSelection !== undefined) {
        logTest('User trial selection flag present', 'pass', {
          message: `needsTrialSelection flag: ${userData.needsTrialSelection}`,
          userTier: userData.tier,
          trialPlan: userData.trialPlan
        });
      } else {
        logTest('User trial selection flag', 'warn', {
          message: 'needsTrialSelection flag not found in user data'
        });
      }
    } else {
      logTest('User endpoint test', 'warn', {
        message: `Unexpected status: ${response.status}`
      });
    }

    // Test protected endpoint with trial selection requirement
    const protectedResponse = await fetchWithCookies(`${IS_PRODUCTION ? BASE_URL : LOCAL_URL}/api/ai/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topic: 'test',
        platform: 'Instagram'
      }),
      agent: IS_PRODUCTION ? httpsAgent : undefined
    });

    if (protectedResponse.status === 403) {
      const body = await protectedResponse.json();
      if (body.needsTrialSelection) {
        logTest('Trial selection enforcement', 'pass', {
          message: 'Protected endpoints enforce trial selection',
          response: body.message
        });
      } else if (body.restrictionType) {
        logTest('Access restriction enforcement', 'pass', {
          message: `Access restricted: ${body.restrictionType}`,
          details: body.message
        });
      }
    } else if (protectedResponse.status === 401) {
      logTest('Protected endpoint authentication', 'pass', {
        message: 'Protected endpoints require authentication'
      });
    }
  } catch (error) {
    logTest('Trial redirection logic', 'fail', {
      message: 'Failed to test trial redirection',
      error: error.message
    });
  }
}

// Test 5: Complete OAuth Flow Simulation
async function testCompleteOAuthFlow() {
  console.log(chalk.blue('\n🔍 Test 5: Complete OAuth Flow Simulation'));

  try {
    // Step 1: Initiate OAuth
    console.log(chalk.gray('   Step 1: Initiating OAuth flow...'));
    const initResponse = await fetchWithCookies(`${IS_PRODUCTION ? BASE_URL : LOCAL_URL}/api/auth/google`, {
      method: 'GET',
      redirect: 'manual',
      agent: IS_PRODUCTION ? httpsAgent : undefined
    });

    if (initResponse.status === 302 || initResponse.status === 303) {
      const authUrl = initResponse.headers.get('location');
      const cookies = initResponse.headers.get('set-cookie');

      // Extract state from URL
      const stateMatch = authUrl?.match(/state=([^&]+)/);
      const state = stateMatch ? stateMatch[1] : null;

      if (state && cookies?.includes('oauth_state')) {
        logTest('OAuth flow initiation', 'pass', {
          message: 'OAuth flow initiated with state parameter and cookie'
        });

        // Step 2: Simulate successful callback (would normally come from Google)
        console.log(chalk.gray('   Step 2: Simulating OAuth callback...'));

        // Note: In production, this would fail without valid Google credentials
        // We're testing the flow structure, not actual Google authentication
        const callbackUrl = `${IS_PRODUCTION ? BASE_URL : LOCAL_URL}/api/auth/google/callback?code=fake_code&state=${state}`;

        const callbackResponse = await fetchWithCookies(callbackUrl, {
          method: 'GET',
          redirect: 'manual',
          agent: IS_PRODUCTION ? httpsAgent : undefined
        });

        if (callbackResponse.status === 302 || callbackResponse.status === 303) {
          const redirectLocation = callbackResponse.headers.get('location');

          // Check for trial selection redirect for new users
          if (redirectLocation?.includes('/trial-selection')) {
            logTest('New user trial redirect', 'pass', {
              message: 'New OAuth users redirected to trial selection',
              redirectTo: redirectLocation
            });
          } else if (redirectLocation?.includes('/auth?error=')) {
            logTest('OAuth error handling', 'pass', {
              message: 'Invalid OAuth handled with error redirect',
              error: redirectLocation.match(/error=([^&]+)/)?.[1]
            });
          } else if (redirectLocation === '/') {
            logTest('Existing user redirect', 'pass', {
              message: 'Existing users redirected to dashboard'
            });
          }

          // Check for JWT cookie
          const setCookieHeader = callbackResponse.headers.get('set-cookie');
          if (setCookieHeader?.includes('mam_jwt')) {
            logTest('JWT cookie setting', 'pass', {
              message: 'JWT cookie set after successful OAuth'
            });
          }
        } else {
          logTest('OAuth callback processing', 'warn', {
            message: 'Callback did not redirect as expected',
            status: callbackResponse.status
          });
        }
      }
    } else {
      logTest('Complete OAuth flow', 'warn', {
        message: 'OAuth flow could not be initiated',
        status: initResponse.status
      });
    }
  } catch (error) {
    logTest('Complete OAuth flow simulation', 'fail', {
      message: 'Failed to simulate complete flow',
      error: error.message
    });
  }
}

// Test 6: Environment Configuration Check
async function testEnvironmentConfig() {
  console.log(chalk.blue('\n🔍 Test 6: Environment Configuration Check'));

  // Check for OAuth environment variables
  const requiredVars = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'JWT_SECRET'
  ];

  for (const varName of requiredVars) {
    if (process.env[varName]) {
      logTest(`Environment: ${varName}`, 'pass', {
        message: `${varName} is configured`,
        valueLength: process.env[varName].length
      });
    } else {
      logTest(`Environment: ${varName}`, IS_PRODUCTION ? 'fail' : 'warn', {
        message: `${varName} is not configured`,
        impact: varName.includes('GOOGLE') ? 'OAuth will not work' : 'Security issue'
      });
    }
  }

  // Check callback URL configuration
  const expectedCallbackUrl = IS_PRODUCTION
    ? 'https://myaimediamgr.onrender.com/api/auth/google/callback'
    : 'http://localhost:5000/api/auth/google/callback';

  logTest('OAuth callback URL', 'info', {
    message: 'Expected callback URL for Google Console',
    url: expectedCallbackUrl
  });
}

// Test 7: Error Handling and Edge Cases
async function testErrorHandling() {
  console.log(chalk.blue('\n🔍 Test 7: Error Handling and Edge Cases'));

  try {
    // Test callback without code parameter
    const noCodeResponse = await fetchWithCookies(
      `${IS_PRODUCTION ? BASE_URL : LOCAL_URL}/api/auth/google/callback?state=test`,
      {
        method: 'GET',
        redirect: 'manual',
        agent: IS_PRODUCTION ? httpsAgent : undefined
      }
    );

    if (noCodeResponse.status === 302 || noCodeResponse.status === 303) {
      const location = noCodeResponse.headers.get('location');
      if (location?.includes('error=')) {
        logTest('Missing code parameter handling', 'pass', {
          message: 'Server handles missing authorization code'
        });
      }
    }

    // Test callback without state parameter
    const noStateResponse = await fetchWithCookies(
      `${IS_PRODUCTION ? BASE_URL : LOCAL_URL}/api/auth/google/callback?code=test`,
      {
        method: 'GET',
        redirect: 'manual',
        agent: IS_PRODUCTION ? httpsAgent : undefined
      }
    );

    if (noStateResponse.status === 302 || noStateResponse.status === 303) {
      const location = noStateResponse.headers.get('location');
      if (location?.includes('error=state_mismatch')) {
        logTest('Missing state parameter handling', 'pass', {
          message: 'Server rejects callback without state'
        });
      }
    }

    // Test logout endpoint
    const logoutResponse = await fetchWithCookies(
      `${IS_PRODUCTION ? BASE_URL : LOCAL_URL}/api/auth/logout`,
      {
        method: 'POST',
        agent: IS_PRODUCTION ? httpsAgent : undefined
      }
    );

    if (logoutResponse.ok) {
      const result = await logoutResponse.json();
      if (result.ok) {
        logTest('Logout endpoint', 'pass', {
          message: 'Logout endpoint functional'
        });
      }

      // Check cookie clearing
      const cookies = logoutResponse.headers.get('set-cookie');
      if (cookies?.includes('mam_jwt=;')) {
        logTest('JWT cookie clearing', 'pass', {
          message: 'JWT cookie cleared on logout'
        });
      }
    }
  } catch (error) {
    logTest('Error handling tests', 'fail', {
      message: 'Failed to test error handling',
      error: error.message
    });
  }
}

// Generate comprehensive test report
function generateReport() {
  console.log(chalk.blue('\n📊 Test Report Summary'));
  console.log(chalk.gray('═'.repeat(50)));

  console.log(`Environment: ${chalk.cyan(testResults.environment)}`);
  console.log(`Base URL: ${chalk.cyan(testResults.baseUrl)}`);
  console.log(`Timestamp: ${chalk.cyan(testResults.timestamp)}`);
  console.log(chalk.gray('─'.repeat(50)));

  console.log(`Total Tests: ${testResults.summary.total}`);
  console.log(`${chalk.green('✅ Passed')}: ${testResults.summary.passed}`);
  console.log(`${chalk.red('❌ Failed')}: ${testResults.summary.failed}`);
  console.log(`${chalk.yellow('⚠️  Warnings')}: ${testResults.summary.warnings}`);

  const passRate = (testResults.summary.passed / testResults.summary.total * 100).toFixed(1);
  const passRateColor = passRate >= 80 ? chalk.green : passRate >= 60 ? chalk.yellow : chalk.red;
  console.log(`Pass Rate: ${passRateColor(passRate + '%')}`);

  // List failed tests
  if (testResults.summary.failed > 0) {
    console.log(chalk.red('\n❌ Failed Tests:'));
    testResults.tests
      .filter(t => t.status === 'fail')
      .forEach(t => {
        console.log(`   - ${t.name}: ${t.details.message}`);
      });
  }

  // List warnings
  if (testResults.summary.warnings > 0) {
    console.log(chalk.yellow('\n⚠️  Warnings:'));
    testResults.tests
      .filter(t => t.status === 'warn')
      .forEach(t => {
        console.log(`   - ${t.name}: ${t.details.message}`);
      });
  }

  // OAuth Configuration Status
  console.log(chalk.blue('\n🔐 OAuth Configuration Status:'));
  const hasGoogleCreds = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  console.log(`   Google OAuth: ${hasGoogleCreds ? chalk.green('Configured') : chalk.red('Not Configured')}`);

  if (!hasGoogleCreds && IS_PRODUCTION) {
    console.log(chalk.red('\n⚠️  CRITICAL: Google OAuth credentials are not configured!'));
    console.log(chalk.yellow('   Required environment variables:'));
    console.log('   - GOOGLE_CLIENT_ID');
    console.log('   - GOOGLE_CLIENT_SECRET');
    console.log(chalk.yellow('\n   Setup Instructions:'));
    console.log('   1. Go to https://console.cloud.google.com');
    console.log('   2. Create/select a project');
    console.log('   3. Enable Google+ API');
    console.log('   4. Create OAuth 2.0 credentials');
    console.log(`   5. Add callback URL: ${chalk.cyan('https://myaimediamgr.onrender.com/api/auth/google/callback')}`);
    console.log('   6. Set environment variables in Render dashboard');
  }

  // Save report to file
  const fs = await import('fs').then(m => m.default);
  const reportPath = `./test-reports/oauth-test-${Date.now()}.json`;

  try {
    if (!fs.existsSync('./test-reports')) {
      fs.mkdirSync('./test-reports', { recursive: true });
    }
    fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
    console.log(chalk.gray(`\n📄 Full report saved to: ${reportPath}`));
  } catch (error) {
    console.log(chalk.yellow('\n⚠️  Could not save report to file'));
  }
}

// Main test execution
async function runTests() {
  console.log(chalk.bold.blue('\n🚀 OAuth Flow Comprehensive Testing\n'));
  console.log(chalk.gray('═'.repeat(50)));

  // Run all tests
  await testOAuthInitiation();
  await testOAuthCallback();
  await testMiddlewareBypass();
  await testTrialRedirection();
  await testCompleteOAuthFlow();
  await testEnvironmentConfig();
  await testErrorHandling();

  // Generate report
  generateReport();

  // Exit with appropriate code
  process.exit(testResults.summary.failed > 0 ? 1 : 0);
}

// Execute tests
runTests().catch(error => {
  console.error(chalk.red('\n❌ Test execution failed:'), error);
  process.exit(1);
});