const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true,
    index: true
  },
  sku: { 
    type: String, 
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    index: true
  },
  // Product Type: Cover, Form, or Plate
  productType: {
    type: String,
    enum: ['Cover', 'Form', 'Plate'],
    required: true,
    default: 'Cover',
    index: true
  },
  // Cover Type (only if productType is 'Cover')
  coverType: {
    type: String,
    enum: [
      'Aster Cover',
      'Without Aster Cover',
      'Color Cover',
      'Genuine Cover',
      'PC Cover',
      'Tissue Cover',
      'Belta Cover',
      'Line Cover',
      'Suzuki Cover',
      'Calendar Cover',
      'Seat Cushion'
    ],
    default: '',
    trim: true,
    index: true
  },
  // Plate-specific fields (only if productType is 'Plate')
  plateCompany: {
    type: String,
    enum: ['DY', 'AH', 'BELTA', ''],
    default: '',
    trim: true,
    index: true
  },
  bikeName: {
    type: String,
    enum: ['70', 'CD', '125', 'Yamaha', 'Plastic Plate', ''],
    default: '',
    trim: true,
    index: true
  },
  plateType: {
    type: String,
    enum: [
      'Single',
      'Double',
      'Side',
      'Lahore',
      'Double (Gormore)',
      ''
    ],
    default: '',
    trim: true,
    index: true
  },
  // Form-specific fields (only if productType is 'Form')
  formCompany: {
    type: String,
    enum: ['AG', 'MR', 'UC', 'MASTER', ''],
    default: '',
    trim: true,
    index: true
  },
  formType: {
    type: String,
    enum: ['Soft', 'Hard', ''],
    default: '',
    trim: true,
    index: true
  },
  formVariant: {
    type: String,
    trim: true,
    default: '',
    index: true
  },
  category: { 
    type: String, 
    default: "General",
    trim: true,
    index: true
  },
  subcategory: {
    type: String,
    default: "",
    trim: true,
    index: true
  },
  company: {
    type: String,
    default: "",
    trim: true,
    index: true
  },
  quantity: { 
    type: Number, 
    default: 0,
    min: 0
  },
  // Base price for the product
  price: { 
    type: Number, 
    default: 0,
    min: 0
  },
  // Base price specific to cover type (if applicable)
  basePrice: {
    type: Number,
    default: 0,
    min: 0
  },
  description: {
    type: String,
    default: "",
    trim: true
  },
  minStockLevel: {
    type: Number,
    default: 10
  },
  maxStockLevel: {
    type: Number,
    default: 1000
  },
  supplier: {
    type: String,
    default: ""
  },
  costPrice: {
    type: Number,
    default: 0,
    min: 0
  },
  profitMargin: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true
});

// Index for better search performance
ItemSchema.index({ name: 'text', sku: 'text', description: 'text' });

// Virtual for profit calculation
ItemSchema.virtual('profit').get(function() {
  return this.price - this.costPrice;
});

// Virtual for profit percentage
ItemSchema.virtual('profitPercentage').get(function() {
  if (this.costPrice === 0) return 0;
  return ((this.price - this.costPrice) / this.costPrice) * 100;
});

// Method to check if item is low stock
ItemSchema.methods.isLowStock = function() {
  return this.quantity <= this.minStockLevel;
};

// Method to check if item is out of stock
ItemSchema.methods.isOutOfStock = function() {
  return this.quantity === 0;
};

// Static method to get low stock items
ItemSchema.statics.getLowStockItems = function(threshold = 10) {
  return this.find({ quantity: { $lte: threshold } });
};

// Static method to get out of stock items
ItemSchema.statics.getOutOfStockItems = function() {
  return this.find({ quantity: 0 });
};

// Pre-save middleware to update lastUpdated
ItemSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

module.exports = mongoose.model('Item', ItemSchema);

