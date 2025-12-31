const mongoose = require('mongoose');

const SoldProductSchema = new mongoose.Schema({
  productName: { 
    type: String, 
    required: true,
    trim: true,
    index: true
  },
  sku: { 
    type: String,
    trim: true
  },
  productType: { 
    type: String, 
    enum: ['Cover', 'Form', 'Plate'], 
    default: 'Cover' 
  },
  coverType: { 
    type: String, 
    trim: true, 
    default: '' 
  },
  plateCompany: { 
    type: String, 
    enum: ['DY', 'AH', 'BELTA', ''], 
    default: '' 
  },
  bikeName: { 
    type: String, 
    trim: true, 
    default: '' 
  },
  plateType: { 
    type: String, 
    trim: true, 
    default: '' 
  },
  formCompany: { 
    type: String, 
    enum: ['AG', 'MR', 'UC', 'MASTER', ''], 
    default: '' 
  },
  formType: { 
    type: String, 
    enum: ['Soft', 'Hard', ''], 
    default: '' 
  },
  formVariant: { 
    type: String, 
    trim: true, 
    default: '' 
  },
  quantity: { 
    type: Number, 
    required: true,
    min: 1
  },
  unitPrice: { 
    type: Number, 
    required: true,
    min: 0
  },
  totalPrice: { 
    type: Number, 
    required: true,
    min: 0
  },
  category: {
    type: String,
    default: ''
  },
  subcategory: {
    type: String,
    default: ''
  },
  company: {
    type: String,
    default: ''
  }
}, { _id: false });

const IncomeSchema = new mongoose.Schema({
  date: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  totalIncome: { 
    type: Number, 
    required: true,
    min: 0
  },
  productsSold: [SoldProductSchema],
  notes: {
    type: String,
    default: '',
    trim: true
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit', 'Other'],
    default: 'Cash'
  },
  customerName: {
    type: String,
    default: '',
    trim: true
  },
  slipNumber: {
    type: String,
    default: '',
    trim: true,
    index: true
  },
  slipId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Slip',
    default: null,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true 
});

// Indexes for better performance
IncomeSchema.index({ date: -1 });
IncomeSchema.index({ totalIncome: -1 });
IncomeSchema.index({ 'productsSold.productName': 1 });
IncomeSchema.index({ paymentMethod: 1 });

// Virtual for formatted date
IncomeSchema.virtual('formattedDate').get(function() {
  return this.date.toLocaleDateString('en-IN');
});

// Virtual for total products count
IncomeSchema.virtual('totalProducts').get(function() {
  return this.productsSold.reduce((sum, product) => sum + product.quantity, 0);
});

// Virtual for average product price
IncomeSchema.virtual('averageProductPrice').get(function() {
  if (this.productsSold.length === 0) return 0;
  return this.totalIncome / this.totalProducts;
});

// Method to calculate profit (if cost prices are available)
IncomeSchema.methods.calculateProfit = function() {
  // This would need cost price data from items
  // For now, return 0 as we don't have cost price in productsSold
  return 0;
};

// Static method to get income by date range
IncomeSchema.statics.getIncomeByDateRange = function(startDate, endDate) {
  return this.find({
    date: { $gte: startDate, $lte: endDate },
    isActive: true
  });
};

// Static method to get top selling products
IncomeSchema.statics.getTopSellingProducts = function(limit = 10, startDate, endDate) {
  const matchStage = { isActive: true };
  if (startDate && endDate) {
    matchStage.date = { $gte: startDate, $lte: endDate };
  }

  return this.aggregate([
    { $match: matchStage },
    { $unwind: '$productsSold' },
    {
      $group: {
        _id: '$productsSold.productName',
        totalQuantity: { $sum: '$productsSold.quantity' },
        totalRevenue: { $sum: '$productsSold.totalPrice' },
        averagePrice: { $avg: '$productsSold.unitPrice' },
        transactions: { $sum: 1 }
      }
    },
    { $sort: { totalQuantity: -1 } },
    { $limit: limit }
  ]);
};

// Static method to get income trends
IncomeSchema.statics.getIncomeTrends = function(period = 'month', limit = 12) {
  let groupFormat;
  const now = new Date();
  let startDate;

  switch (period) {
    case 'day':
      groupFormat = '%Y-%m-%d';
      startDate = new Date(now);
      startDate.setDate(now.getDate() - limit);
      break;
    case 'week':
      groupFormat = '%Y-%U';
      startDate = new Date(now);
      startDate.setDate(now.getDate() - (limit * 7));
      break;
    case 'month':
      groupFormat = '%Y-%m';
      startDate = new Date(now.getFullYear(), now.getMonth() - limit, 1);
      break;
    case 'year':
      groupFormat = '%Y';
      startDate = new Date(now.getFullYear() - limit, 0, 1);
      break;
  }

  return this.aggregate([
    { 
      $match: { 
        date: { $gte: startDate },
        isActive: true
      } 
    },
    {
      $group: {
        _id: {
          $dateToString: { format: groupFormat, date: '$date' }
        },
        totalIncome: { $sum: '$totalIncome' },
        totalProducts: { $sum: { $sum: '$productsSold.quantity' } },
        transactions: { $sum: 1 },
        averageTransaction: { $avg: '$totalIncome' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

// Pre-save middleware to validate total price
IncomeSchema.pre('save', function(next) {
  const calculatedTotal = this.productsSold.reduce((sum, product) => sum + product.totalPrice, 0);
  
  if (Math.abs(calculatedTotal - this.totalIncome) > 0.01) {
    console.warn(`Income total mismatch: calculated ${calculatedTotal}, stored ${this.totalIncome}`);
  }
  
  next();
});

module.exports = mongoose.models.Income || mongoose.model("Income", IncomeSchema);

