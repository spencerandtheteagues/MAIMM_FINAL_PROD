#!/usr/bin/env node
/**
 * Performance and Load Testing Suite
 * Tests application performance under various load conditions
 */

import autocannon from 'autocannon';
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.TEST_URL || 'https://myaimediamgr.onrender.com';
const CONNECTIONS = parseInt(process.env.CONNECTIONS) || 10;
const DURATION = parseInt(process.env.DURATION) || 30;

class PerformanceTests {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      environment: BASE_URL,
      tests: [],
      metrics: {
        pageLoad: {},
        api: {},
        resources: {}
      }
    };
  }

  async runLoadTest(endpoint, options = {}) {
    console.log(`\n📊 Load Testing: ${endpoint}`);

    const instance = autocannon({
      url: `${BASE_URL}${endpoint}`,
      connections: options.connections || CONNECTIONS,
      duration: options.duration || DURATION,
      pipelining: options.pipelining || 1,
      headers: options.headers || {},
      ...options
    });

    return new Promise((resolve) => {
      instance.on('done', (results) => {
        const summary = {
          endpoint,
          requests: {
            total: results.requests.total,
            average: results.requests.average,
            mean: results.requests.mean,
            stddev: results.requests.stddev,
            p99: results.requests.p99
          },
          throughput: {
            total: results.throughput.total,
            average: results.throughput.average,
            mean: results.throughput.mean,
            p99: results.throughput.p99
          },
          latency: {
            min: results.latency.min,
            max: results.latency.max,
            mean: results.latency.mean,
            stddev: results.latency.stddev,
            p50: results.latency.p50,
            p90: results.latency.p90,
            p99: results.latency.p99
          },
          errors: results.errors,
          timeouts: results.timeouts,
          non2xx: results.non2xx || 0
        };

        console.log(`✅ Completed: ${summary.requests.total} requests`);
        console.log(`   Latency p99: ${summary.latency.p99}ms`);
        console.log(`   Errors: ${summary.errors}, Timeouts: ${summary.timeouts}`);

        resolve(summary);
      });
    });
  }

  async testPageLoadPerformance() {
    console.log('\n🚀 Testing Page Load Performance...');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const pages = [
      { name: 'Landing Page', url: BASE_URL },
      { name: 'Pricing Page', url: `${BASE_URL}/pricing` },
      { name: 'Trial Selection', url: `${BASE_URL}/trial-selection` },
      { name: 'Auth Page', url: `${BASE_URL}/auth` }
    ];

    const pageMetrics = [];

    for (const pageInfo of pages) {
      console.log(`  Testing: ${pageInfo.name}`);

      // Enable performance tracking
      await page.coverage.startJSCoverage();
      await page.coverage.startCSSCoverage();

      const startTime = Date.now();
      const metrics = [];

      // Capture performance metrics
      page.on('load', async () => {
        const performanceMetrics = await page.evaluate(() => {
          const navigation = performance.getEntriesByType('navigation')[0];
          const paint = performance.getEntriesByType('paint');

          return {
            navigation: navigation ? {
              domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
              loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
              domInteractive: navigation.domInteractive,
              responseTime: navigation.responseEnd - navigation.requestStart
            } : null,
            paint: paint.map(p => ({ name: p.name, startTime: p.startTime }))
          };
        });
        metrics.push(performanceMetrics);
      });

      try {
        const response = await page.goto(pageInfo.url, {
          waitUntil: 'networkidle',
          timeout: 30000
        });

        const loadTime = Date.now() - startTime;

        // Get coverage data
        const jsCoverage = await page.coverage.stopJSCoverage();
        const cssCoverage = await page.coverage.stopCSSCoverage();

        // Calculate unused bytes
        const jsUnused = jsCoverage.reduce((acc, entry) => {
          const unused = entry.ranges.reduce((sum, range) => sum + (range.end - range.start), 0);
          return acc + (entry.text.length - unused);
        }, 0);

        const cssUnused = cssCoverage.reduce((acc, entry) => {
          const unused = entry.ranges.reduce((sum, range) => sum + (range.end - range.start), 0);
          return acc + (entry.text.length - unused);
        }, 0);

        // Get resource timing
        const resourceTiming = await page.evaluate(() => {
          const resources = performance.getEntriesByType('resource');
          return resources.map(r => ({
            name: r.name.split('/').pop(),
            type: r.initiatorType,
            duration: r.duration,
            size: r.transferSize
          })).sort((a, b) => b.duration - a.duration).slice(0, 10); // Top 10 slowest
        });

        // Check for render-blocking resources
        const renderBlocking = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
          const scripts = Array.from(document.querySelectorAll('script:not([async]):not([defer])'));
          return {
            blockingCSS: links.length,
            blockingJS: scripts.filter(s => s.src).length
          };
        });

        pageMetrics.push({
          name: pageInfo.name,
          url: pageInfo.url,
          loadTime,
          status: response.status(),
          metrics: metrics[0] || {},
          coverage: {
            jsUnusedBytes: jsUnused,
            cssUnusedBytes: cssUnused
          },
          slowestResources: resourceTiming,
          renderBlocking
        });

      } catch (error) {
        pageMetrics.push({
          name: pageInfo.name,
          url: pageInfo.url,
          error: error.message
        });
      }
    }

    await browser.close();

    this.results.metrics.pageLoad = pageMetrics;
    return pageMetrics;
  }

  async testAPIEndpointPerformance() {
    console.log('\n🔥 Testing API Endpoint Performance...');

    const endpoints = [
      { path: '/api/health', method: 'GET', name: 'Health Check' },
      { path: '/api/trial/plans', method: 'GET', name: 'Trial Plans' },
      { path: '/api/auth/config', method: 'GET', name: 'Auth Config' }
    ];

    const apiMetrics = [];

    for (const endpoint of endpoints) {
      const result = await this.runLoadTest(endpoint.path, {
        connections: 5,
        duration: 10,
        method: endpoint.method
      });

      apiMetrics.push({
        ...endpoint,
        ...result
      });
    }

    this.results.metrics.api = apiMetrics;
    return apiMetrics;
  }

  async testConcurrentUserLoad() {
    console.log('\n👥 Testing Concurrent User Load...');

    const scenarios = [
      { users: 10, duration: 20, name: 'Light Load' },
      { users: 50, duration: 20, name: 'Medium Load' },
      { users: 100, duration: 20, name: 'Heavy Load' }
    ];

    const loadResults = [];

    for (const scenario of scenarios) {
      console.log(`  Running: ${scenario.name} (${scenario.users} users)`);

      const result = await this.runLoadTest('/', {
        connections: scenario.users,
        duration: scenario.duration,
        pipelining: 1
      });

      loadResults.push({
        ...scenario,
        ...result
      });
    }

    this.results.metrics.concurrentLoad = loadResults;
    return loadResults;
  }

  async testResourceOptimization() {
    console.log('\n⚡ Testing Resource Optimization...');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Monitor network activity
    const resources = [];
    page.on('response', response => {
      resources.push({
        url: response.url(),
        status: response.status(),
        headers: response.headers(),
        timing: response.timing()
      });
    });

    await page.goto(`${BASE_URL}/pricing`, { waitUntil: 'networkidle' });

    // Analyze resources
    const analysis = {
      totalResources: resources.length,
      byType: {},
      caching: {
        cached: 0,
        notCached: 0
      },
      compression: {
        compressed: 0,
        uncompressed: 0
      },
      largeResources: []
    };

    for (const resource of resources) {
      // Categorize by type
      const ext = path.extname(new URL(resource.url).pathname).toLowerCase();
      const type = ext || 'other';
      analysis.byType[type] = (analysis.byType[type] || 0) + 1;

      // Check caching
      const cacheControl = resource.headers['cache-control'];
      if (cacheControl && cacheControl.includes('max-age')) {
        analysis.caching.cached++;
      } else {
        analysis.caching.notCached++;
      }

      // Check compression
      const encoding = resource.headers['content-encoding'];
      if (encoding && (encoding.includes('gzip') || encoding.includes('br'))) {
        analysis.compression.compressed++;
      } else {
        analysis.compression.uncompressed++;
      }

      // Identify large resources
      const size = parseInt(resource.headers['content-length'] || 0);
      if (size > 100000) { // > 100KB
        analysis.largeResources.push({
          url: resource.url.split('/').pop(),
          size: Math.round(size / 1024) + 'KB'
        });
      }
    }

    await browser.close();

    this.results.metrics.resources = analysis;
    return analysis;
  }

  async testCriticalRenderPath() {
    console.log('\n🎨 Testing Critical Render Path...');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Enable CDP
    const client = await page.context().newCDPSession(page);
    await client.send('Performance.enable');

    const metrics = [];

    await page.goto(`${BASE_URL}/pricing`, { waitUntil: 'domcontentloaded' });

    // Get performance metrics
    const perfMetrics = await client.send('Performance.getMetrics');
    const timing = await page.evaluate(() => JSON.stringify(window.performance.timing));

    // Get First Contentful Paint and other metrics
    const paintMetrics = await page.evaluate(() => {
      const paintEntries = performance.getEntriesByType('paint');
      const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');
      const fpEntry = paintEntries.find(e => e.name === 'first-paint');

      return {
        firstPaint: fpEntry ? fpEntry.startTime : null,
        firstContentfulPaint: fcpEntry ? fcpEntry.startTime : null,
        domInteractive: performance.timing.domInteractive - performance.timing.navigationStart,
        domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
        loadComplete: performance.timing.loadEventEnd - performance.timing.navigationStart
      };
    });

    await browser.close();

    const criticalMetrics = {
      paintMetrics,
      performanceMetrics: perfMetrics.metrics,
      recommendations: []
    };

    // Generate recommendations
    if (paintMetrics.firstContentfulPaint > 2000) {
      criticalMetrics.recommendations.push('First Contentful Paint is slow (>2s). Consider optimizing critical CSS and reducing render-blocking resources.');
    }
    if (paintMetrics.domInteractive > 3000) {
      criticalMetrics.recommendations.push('Time to Interactive is slow (>3s). Consider code splitting and lazy loading.');
    }

    this.results.metrics.criticalRenderPath = criticalMetrics;
    return criticalMetrics;
  }

  async generateReport() {
    console.log('\n📋 Generating Performance Report...');

    const reportDir = path.join(__dirname, '../../test-reports/performance');
    await fs.mkdir(reportDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(reportDir, `performance-${timestamp}.json`);
    const htmlPath = path.join(reportDir, `performance-${timestamp}.html`);

    // Save JSON report
    await fs.writeFile(jsonPath, JSON.stringify(this.results, null, 2));

    // Generate HTML report
    const htmlContent = this.generateHTMLReport();
    await fs.writeFile(htmlPath, htmlContent);

    console.log(`✅ Reports saved:`);
    console.log(`   JSON: ${jsonPath}`);
    console.log(`   HTML: ${htmlPath}`);

    return { jsonPath, htmlPath };
  }

  generateHTMLReport() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Test Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, system-ui, sans-serif;
            background: #f5f5f5;
            padding: 2rem;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        h1, h2 {
            color: #333;
            margin-bottom: 1rem;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 2rem;
            margin-bottom: 2rem;
        }
        .card {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .metric {
            display: flex;
            justify-content: space-between;
            padding: 0.5rem 0;
            border-bottom: 1px solid #eee;
        }
        .metric:last-child {
            border-bottom: none;
        }
        .metric-label {
            color: #666;
        }
        .metric-value {
            font-weight: 600;
            color: #333;
        }
        .status-good { color: #10b981; }
        .status-warning { color: #f59e0b; }
        .status-bad { color: #ef4444; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 1rem;
        }
        th, td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        th {
            background: #f9f9f9;
            font-weight: 600;
        }
        .chart-container {
            position: relative;
            height: 300px;
            margin: 1rem 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Performance Test Report</h1>
        <p style="color: #666; margin-bottom: 2rem;">Generated: ${new Date(this.results.timestamp).toLocaleString()}</p>

        <div class="grid">
            ${this.generatePageLoadMetrics()}
            ${this.generateAPIMetrics()}
        </div>

        ${this.generateResourceAnalysis()}
        ${this.generateRecommendations()}
    </div>
</body>
</html>`;
  }

  generatePageLoadMetrics() {
    if (!this.results.metrics.pageLoad || this.results.metrics.pageLoad.length === 0) {
      return '<div class="card"><h2>Page Load Metrics</h2><p>No data available</p></div>';
    }

    return this.results.metrics.pageLoad.map(page => `
      <div class="card">
        <h2>${page.name}</h2>
        <div class="metric">
          <span class="metric-label">Load Time</span>
          <span class="metric-value ${page.loadTime < 2000 ? 'status-good' : page.loadTime < 4000 ? 'status-warning' : 'status-bad'}">
            ${page.loadTime}ms
          </span>
        </div>
        <div class="metric">
          <span class="metric-label">Status</span>
          <span class="metric-value">${page.status || 'N/A'}</span>
        </div>
        ${page.renderBlocking ? `
        <div class="metric">
          <span class="metric-label">Render Blocking CSS</span>
          <span class="metric-value">${page.renderBlocking.blockingCSS}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Render Blocking JS</span>
          <span class="metric-value">${page.renderBlocking.blockingJS}</span>
        </div>
        ` : ''}
      </div>
    `).join('');
  }

  generateAPIMetrics() {
    if (!this.results.metrics.api || this.results.metrics.api.length === 0) {
      return '<div class="card"><h2>API Metrics</h2><p>No data available</p></div>';
    }

    return this.results.metrics.api.map(api => `
      <div class="card">
        <h2>${api.name}</h2>
        <div class="metric">
          <span class="metric-label">Total Requests</span>
          <span class="metric-value">${api.requests.total}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Avg Latency</span>
          <span class="metric-value ${api.latency.mean < 100 ? 'status-good' : api.latency.mean < 500 ? 'status-warning' : 'status-bad'}">
            ${Math.round(api.latency.mean)}ms
          </span>
        </div>
        <div class="metric">
          <span class="metric-label">P99 Latency</span>
          <span class="metric-value">${api.latency.p99}ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">Errors</span>
          <span class="metric-value ${api.errors === 0 ? 'status-good' : 'status-bad'}">${api.errors}</span>
        </div>
      </div>
    `).join('');
  }

  generateResourceAnalysis() {
    if (!this.results.metrics.resources) {
      return '';
    }

    const resources = this.results.metrics.resources;
    return `
      <div class="card" style="grid-column: 1 / -1;">
        <h2>Resource Analysis</h2>
        <div class="grid" style="margin-top: 1rem;">
          <div>
            <h3>Caching</h3>
            <div class="metric">
              <span class="metric-label">Cached Resources</span>
              <span class="metric-value">${resources.caching.cached}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Not Cached</span>
              <span class="metric-value">${resources.caching.notCached}</span>
            </div>
          </div>
          <div>
            <h3>Compression</h3>
            <div class="metric">
              <span class="metric-label">Compressed</span>
              <span class="metric-value">${resources.compression.compressed}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Uncompressed</span>
              <span class="metric-value">${resources.compression.uncompressed}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  generateRecommendations() {
    const recommendations = [];

    // Analyze page load metrics
    if (this.results.metrics.pageLoad) {
      const slowPages = this.results.metrics.pageLoad.filter(p => p.loadTime > 3000);
      if (slowPages.length > 0) {
        recommendations.push(`${slowPages.length} pages have slow load times (>3s). Consider optimizing assets and reducing JavaScript bundle size.`);
      }
    }

    // Analyze API metrics
    if (this.results.metrics.api) {
      const slowAPIs = this.results.metrics.api.filter(a => a.latency && a.latency.mean > 500);
      if (slowAPIs.length > 0) {
        recommendations.push(`${slowAPIs.length} API endpoints have high latency (>500ms). Consider implementing caching or optimizing database queries.`);
      }
    }

    // Analyze critical render path
    if (this.results.metrics.criticalRenderPath?.recommendations) {
      recommendations.push(...this.results.metrics.criticalRenderPath.recommendations);
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance metrics are within acceptable ranges.');
    }

    return `
      <div class="card" style="grid-column: 1 / -1;">
        <h2>Recommendations</h2>
        <ul style="margin-left: 1.5rem; color: #666; line-height: 1.8;">
          ${recommendations.map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  async runAllTests() {
    console.log('\n========================================');
    console.log('   PERFORMANCE TESTING SUITE');
    console.log(`   Target: ${BASE_URL}`);
    console.log('========================================\n');

    try {
      await this.testPageLoadPerformance();
      await this.testAPIEndpointPerformance();
      await this.testConcurrentUserLoad();
      await this.testResourceOptimization();
      await this.testCriticalRenderPath();
      await this.generateReport();

      console.log('\n✅ All performance tests completed!');
      return this.results;
    } catch (error) {
      console.error('❌ Performance test suite failed:', error);
      throw error;
    }
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new PerformanceTests();
  tester.runAllTests()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default PerformanceTests;