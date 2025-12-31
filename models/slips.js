const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  productName: { type: String, required: true, trim: true },
  productType: { type: String, enum: ['Cover', 'Form', 'Plate'], default: 'Cover' },
  coverType: { type: String, trim: true, default: "" },
  // Plate-specific fields
  plateCompany: { type: String, enum: ['DY', 'AH', 'BELTA', ''], default: "" },
  bikeName: { type: String, trim: true, default: "" },
  plateType: { type: String, trim: true, default: "" },
  // Form-specific fields
  formCompany: { type: String, enum: ['AG', 'MR', 'UC', 'MASTER', ''], default: "" },
  formType: { type: String, enum: ['Soft', 'Hard', ''], default: "" },
  formVariant: { type: String, trim: true, default: "" },
  quantity: { type: Number, required: true, min: 1 },
  basePrice: { type: Number, required: true, min: 0 }, // Original base price
  unitPrice: { type: Number, required: true, min: 0 }, // Final price after discounts/overrides
  discountAmount: { type: Number, default: 0, min: 0 }, // Discount applied
  discountType: { type: String, enum: ['none', 'bulk', 'manual'], default: 'none' }, // Type of discount
  totalPrice: { type: Number, required: true, min: 0 },
  category: { type: String, trim: true, default: "" },
  subcategory: { type: String, trim: true, default: "" },
  company: { type: String, trim: true, default: "" }
}, { _id: false });

const SlipSchema = new mongoose.Schema({
  slipNumber: { type: String, unique: true, trim: true },

  date: { type: Date, default: Date.now },

  customerName: { 
    type: String, 
    default: 'Walk-in Customer', 
    trim: true 
  },

  customerPhone: {
    type: String,
    trim: true,
    default: ''
  },

  paymentMethod: {
    type: String,
    enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Credit', 'Other'],
    default: 'Cash'
  },

  notes: {
    type: String,
    trim: true,
    default: ''
  },

  tax: {
    type: Number,
    default: 0,
    min: 0
  },

  discount: {
    type: Number,
    default: 0,
    min: 0
  },

  products: [ProductSchema],

  subtotal: { type: Number, required: true, min: 0 },

  totalAmount: { type: Number, required: true, min: 0 },

  status: {
    type: String,
    enum: ['Pending', 'Paid', 'Cancelled'],
    default: 'Paid'
  },

  cancelledAt: {
    type: Date,
    default: null
  }

}, { timestamps: true });

// indexes
SlipSchema.index({ date: -1 });
SlipSchema.index({ customerName: 1 });

// Auto slip number
SlipSchema.pre('save', function (next) {
  if (!this.slipNumber) {
    this.slipNumber = `SLP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  }
  next();
});

module.exports = mongoose.models.Slip || mongoose.model("Slip", SlipSchema);
