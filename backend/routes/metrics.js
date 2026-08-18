const express = require('express');
const router = express.Router();
const { getMetrics, getMetricsContentType } = require('../services/metrics');

/**
 * GET /metrics
 * Exposes Prometheus-compatible metric exposition format.
 */
router.get('/', async (req, res) => {
  try {
    const metricsData = await getMetrics();
    res.setHeader('Content-Type', getMetricsContentType());
    res.send(metricsData);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate metrics', details: err.message });
  }
});

module.exports = router;
