const express = require('express');
const router = express.Router();
const Item = require('../models/items');
const Slip = require('../models/slips');
const Income = require('../models/income');

// GET /api/analytics/dashboard - Get comprehensive dashboard analytics
router.get('/dashboard', async (req, res) => {
  try {
    console.log('📊 Fetching dashboard analytics...');
    
    // Basic counts
    const totalItems = await Item.countDocuments({ isActive: true });
    const totalSlips = await Slip.countDocuments();
    const totalIncomeRecords = await Income.countDocuments({ isActive: true });
    
    // Revenue calculations
    const totalRevenueResult = await Slip.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    const totalRevenue = totalRevenueResult[0]?.total || 0;

    // Today's date calculations
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Today's slips and revenue
    const todaySlips = await Slip.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow }
    });

    const todayRevenueResult = await Slip.aggregate([
      { 
        $match: { 
          createdAt: { $gte: today, $lt: tomorrow },
          status: { $ne: 'Cancelled' }
        } 
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    const todayRevenue = todayRevenueResult[0]?.total || 0;

    // Low stock items
    const lowStockItems = await Item.countDocuments({ 
      quantity: { $lte: 10 },
      isActive: true 
    });

    // Recent sales activity
    const recentSales = await Slip.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('slipNumber totalAmount customerName createdAt');

    // Payment method distribution
    const paymentMethods = await Slip.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          total: { $sum: '$totalAmount' }
        }
      }
    ]);

    res.json({
      summary: {
        totalItems,
        totalSlips,
        totalIncomeRecords,
        totalRevenue,
        todaySlips,
        todayRevenue,
        lowStockItems
      },
      recentSales,
      paymentMethods,
      message: 'Dashboard analytics fetched successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching analytics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch analytics', 
      details: error.message 
    });
  }
});

// GET /api/analytics/sales-trends - Get sales trends for charts
router.get('/sales-trends', async (req, res) => {
  try {
    const { period = 'week' } = req.query; // week, month, year
    
    let days = 7;
    let groupFormat = '%Y-%m-%d';
    
    switch (period) {
      case 'month':
        days = 30;
        break;
      case 'year':
        days = 365;
        groupFormat = '%Y-%m';
        break;
      default:
        days = 7;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const salesTrends = await Slip.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: { $ne: 'Cancelled' }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: groupFormat, date: '$createdAt' } }
          },
          totalSales: { $sum: '$totalAmount' },
          totalTransactions: { $sum: 1 },
          averageSale: { $avg: '$totalAmount' }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    res.json({
      period,
      salesTrends,
      message: 'Sales trends fetched successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching sales trends:', error);
    res.status(500).json({ 
      error: 'Failed to fetch sales trends', 
      details: error.message 
    });
  }
});

// GET /api/analytics/top-products - Get top selling products
router.get('/top-products', async (req, res) => {
  try {
    const { limit = 10, period = 'all' } = req.query;
    
    let matchStage = { status: { $ne: 'Cancelled' } };
    
    if (period !== 'all') {
      const days = period === 'week' ? 7 : period === 'month' ? 30 : 365;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      matchStage.createdAt = { $gte: startDate };
    }

    const topProducts = await Slip.aggregate([
      { $match: matchStage },
      { $unwind: '$products' },
      {
        $group: {
          _id: '$products.productName',
          totalQuantity: { $sum: '$products.quantity' },
          totalRevenue: { $sum: '$products.totalPrice' },
          transactionCount: { $sum: 1 }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: parseInt(limit) }
    ]);

    res.json({
      period,
      topProducts,
      message: 'Top products fetched successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching top products:', error);
    res.status(500).json({ 
      error: 'Failed to fetch top products', 
      details: error.message 
    });
  }
});

// GET /api/analytics/inventory-levels - Get inventory stock levels
router.get('/inventory-levels', async (req, res) => {
  try {
    console.log('📦 Fetching inventory levels...');
    
    // Find items - handle both with and without isActive field, and ensure quantity exists
    const items = await Item.find({ 
      $or: [
        { isActive: { $exists: false } },
        { isActive: true },
        { isActive: { $ne: false } }
      ],
      quantity: { $exists: true } // Ensure quantity field exists
    })
      .select('name quantity price category')
      .sort({ quantity: 1 })
      .limit(50)
      .lean(); // Use lean() for better performance

    // Ensure quantity is a number, default to 0 if null/undefined/NaN
    const processedItems = items.map(item => {
      const qty = typeof item.quantity === 'number' && !isNaN(item.quantity) 
        ? item.quantity 
        : 0;
      return {
        _id: item._id,
        name: item.name || 'Unnamed Item',
        quantity: qty,
        price: typeof item.price === 'number' ? item.price : 0,
        category: item.category || 'General'
      };
    });

    const stockLevels = {
      outOfStock: processedItems.filter(i => i.quantity === 0),
      lowStock: processedItems.filter(i => i.quantity > 0 && i.quantity <= 10),
      inStock: processedItems.filter(i => i.quantity > 10)
    };

    console.log(`✅ Inventory levels fetched: ${processedItems.length} items`);

    res.json({
      stockLevels,
      totalItems: processedItems.length,
      message: 'Inventory levels fetched successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching inventory levels:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.stack) {
      console.error('Error stack:', error.stack);
    }
    
    // Return a safe response even on error
    res.status(500).json({ 
      error: 'Failed to fetch inventory levels', 
      details: error.message || 'Unknown error occurred',
      stockLevels: {
        outOfStock: [],
        lowStock: [],
        inStock: []
      },
      totalItems: 0
    });
  }
});

// GET /api/analytics/orders-by-status - Get orders grouped by status
router.get('/orders-by-status', async (req, res) => {
  try {
    const ordersByStatus = await Slip.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      ordersByStatus,
      message: 'Orders by status fetched successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching orders by status:', error);
    res.status(500).json({ 
      error: 'Failed to fetch orders by status', 
      details: error.message 
    });
  }
});

module.exports = router;