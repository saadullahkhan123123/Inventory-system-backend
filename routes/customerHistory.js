const express = require('express');
const router = express.Router();
const Slip = require('../models/slips');
const Income = require('../models/income');

// Test route to verify the router is working
router.get('/test', (req, res) => {
  res.json({ message: 'Customer History API is working!', timestamp: new Date() });
});

// GET /api/customer-history/search/suggestions - Get customer name suggestions (MUST BE BEFORE /:customerName)
router.get('/search/suggestions', async (req, res) => {
  try {
    const { query = '' } = req.query;
    
    if (query.length < 2) {
      return res.json({ suggestions: [] });
    }

    const customers = await Slip.distinct('customerName', {
      customerName: { $regex: query, $options: 'i' },
      status: { $ne: 'Cancelled' }
    }).limit(10);

    res.json({ suggestions: customers });
  } catch (err) {
    console.error('❌ Error fetching customer suggestions:', err);
    res.status(500).json({ error: 'Failed to fetch suggestions', details: err.message });
  }
});

// GET /api/customer-history/:customerName - Get all history for a customer
// NOTE: This route must come AFTER /search/suggestions to avoid route conflicts
router.get('/:customerName', async (req, res) => {
  try {
    // Skip if this is the suggestions route
    if (req.params.customerName === 'search') {
      return res.status(404).json({ error: 'Route not found' });
    }

    const { customerName } = req.params;
    const { startDate, endDate } = req.query;

    if (!customerName || customerName.trim() === '') {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    // Build filter
    const filter = {
      customerName: { $regex: customerName.trim(), $options: 'i' },
      status: { $ne: 'Cancelled' } // Exclude cancelled slips
    };

    // Add date filter if provided
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Fetch all slips for the customer
    const slips = await Slip.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    // Calculate statistics
    const totalSlips = slips.length;
    const totalAmount = slips.reduce((sum, slip) => sum + (slip.totalAmount || 0), 0);
    const totalProducts = slips.reduce((sum, slip) => {
      return sum + (slip.products?.reduce((pSum, p) => pSum + (p.quantity || 0), 0) || 0);
    }, 0);

    // Group by month
    const monthlyData = {};
    slips.forEach(slip => {
      const date = new Date(slip.createdAt || slip.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthName,
          slips: [],
          totalAmount: 0,
          totalProducts: 0,
          slipCount: 0
        };
      }
      
      monthlyData[monthKey].slips.push(slip);
      monthlyData[monthKey].totalAmount += slip.totalAmount || 0;
      monthlyData[monthKey].totalProducts += slip.products?.reduce((sum, p) => sum + (p.quantity || 0), 0) || 0;
      monthlyData[monthKey].slipCount += 1;
    });

    // Group by week
    const weeklyData = {};
    slips.forEach(slip => {
      const date = new Date(slip.createdAt || slip.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      const weekKey = `${weekStart.getFullYear()}-W${getWeekNumber(weekStart)}`;
      const weekLabel = `Week ${getWeekNumber(weekStart)}, ${weekStart.getFullYear()}`;
      
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = {
          week: weekLabel,
          slips: [],
          totalAmount: 0,
          totalProducts: 0,
          slipCount: 0
        };
      }
      
      weeklyData[weekKey].slips.push(slip);
      weeklyData[weekKey].totalAmount += slip.totalAmount || 0;
      weeklyData[weekKey].totalProducts += slip.products?.reduce((sum, p) => sum + (p.quantity || 0), 0) || 0;
      weeklyData[weekKey].slipCount += 1;
    });

    // Get unique products purchased
    const productsMap = new Map();
    slips.forEach(slip => {
      slip.products?.forEach(product => {
        const key = product.productName || 'Unknown';
        if (productsMap.has(key)) {
          const existing = productsMap.get(key);
          existing.quantity += product.quantity || 0;
          existing.totalAmount += product.totalPrice || 0;
          existing.slipCount += 1;
        } else {
          productsMap.set(key, {
            productName: key,
            quantity: product.quantity || 0,
            totalAmount: product.totalPrice || 0,
            slipCount: 1,
            productType: product.productType || 'Cover',
            coverType: product.coverType || '',
            plateCompany: product.plateCompany || '',
            bikeName: product.bikeName || '',
            plateType: product.plateType || '',
            formCompany: product.formCompany || '',
            formType: product.formType || '',
            formVariant: product.formVariant || ''
          });
        }
      });
    });

    const products = Array.from(productsMap.values()).sort((a, b) => b.quantity - a.quantity);

    res.json({
      customerName: customerName.trim(),
      summary: {
        totalSlips,
        totalAmount,
        totalProducts,
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null
        }
      },
      monthly: Object.values(monthlyData).sort((a, b) => {
        // Sort by month key descending
        const aKey = Object.keys(monthlyData).find(key => monthlyData[key] === a);
        const bKey = Object.keys(monthlyData).find(key => monthlyData[key] === b);
        return bKey.localeCompare(aKey);
      }),
      weekly: Object.values(weeklyData).sort((a, b) => {
        // Sort by week key descending
        const aKey = Object.keys(weeklyData).find(key => weeklyData[key] === a);
        const bKey = Object.keys(weeklyData).find(key => weeklyData[key] === b);
        return bKey.localeCompare(aKey);
      }),
      products,
      allSlips: slips
    });

  } catch (err) {
    console.error('❌ Error fetching customer history:', err);
    res.status(500).json({ error: 'Failed to fetch customer history', details: err.message });
  }
});

// Helper function to get week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

module.exports = router;

