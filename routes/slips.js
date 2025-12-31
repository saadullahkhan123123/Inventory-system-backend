const express = require('express');
const router = express.Router();
const Slip = require('../models/slips');
const Item = require('../models/items');
const Income = require('../models/income');

// GET all slips
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, startDate, endDate, status = '' } = req.query;

    const filter = {};

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (status) {
      filter.status = status;
    }

    const slips = await Slip.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Slip.countDocuments(filter);

    res.json({
      slips,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      totalSlips: total
    });

  } catch (err) {
    console.error('❌ Error fetching slips:', err);
    res.status(500).json({ error: 'Failed to fetch slips', details: err.message });
  }
});

// GET slip by ID
router.get('/:id', async (req, res) => {
  try {
    const slip = await Slip.findById(req.params.id);
    if (!slip) return res.status(404).json({ error: 'Slip not found' });

    res.json(slip);

  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid slip ID format' });
    }

    res.status(500).json({ error: 'Failed to fetch slip', details: err.message });
  }
});

// CREATE slip + update inventory
router.post('/', async (req, res) => {
  const session = await Slip.startSession();
  session.startTransaction();

  try {
    const { customerName, subtotal, totalAmount, products } = req.body;

    if (!products || products.length === 0) {
      return res.status(400).json({ error: 'Products cannot be empty' });
    }

    if (subtotal == null || totalAmount == null) {
      return res.status(400).json({ error: 'Subtotal and totalAmount required' });
    }

    const productUpdates = [];

    for (const p of products) {
      const productName = p.productName || p.itemName;
      const quantity = p.quantity;
      const unitPrice = p.unitPrice ?? p.price;

      const inventoryItem = await Item.findOne({
        $or: [
          { name: { $regex: new RegExp(productName, 'i') } },
          { sku: { $regex: new RegExp(productName, 'i') } }
        ],
        isActive: true
      }).session(session);

      if (!inventoryItem) {
        return res.status(400).json({ error: `Product '${productName}' not found in inventory` });
      }

      if (inventoryItem.quantity < quantity) {
        return res.status(400).json({
          error: `Insufficient stock for '${productName}'. Available: ${inventoryItem.quantity}`
        });
      }

      productUpdates.push({
        itemId: inventoryItem._id,
        quantity
      });
    }

    // Helper function to calculate bulk discount
    const calculateBulkDiscount = (coverType, quantity, basePrice) => {
      // Bulk discount applies only to these cover types
      const bulkDiscountTypes = [
        'Aster Cover',
        'Without Aster Cover',
        'Calendar Cover'
      ];
      
      if (bulkDiscountTypes.includes(coverType) && quantity >= 10) {
        return 10; // 10 rupees discount per item
      }
      return 0;
    };

    // Process products with pricing logic
    const processedProducts = products.map(p => {
      const productName = p.productName || p.itemName;
      const quantity = p.quantity;
      const basePrice = p.basePrice || p.unitPrice || p.price || 0;
      const coverType = p.coverType || '';
      const productType = p.productType || 'Cover';
      
      // Calculate bulk discount if applicable
      let discountAmount = 0;
      let discountType = 'none';
      
      if (productType === 'Cover' && coverType) {
        const bulkDiscount = calculateBulkDiscount(coverType, quantity, basePrice);
        if (bulkDiscount > 0) {
          discountAmount = bulkDiscount;
          discountType = 'bulk';
        }
      }
      
      // Manual discount/override (if admin manually adjusted price)
      const finalUnitPrice = p.unitPrice !== undefined ? p.unitPrice : (basePrice - discountAmount);
      
      // If unitPrice was manually set, it's a manual override
      if (p.unitPrice !== undefined && p.unitPrice !== (basePrice - discountAmount)) {
        discountType = 'manual';
        discountAmount = basePrice - finalUnitPrice;
      }
      
      return {
        productName,
        productType,
        coverType,
        plateCompany: p.plateCompany || '',
        bikeName: p.bikeName || '',
        plateType: p.plateType || '',
        formCompany: p.formCompany || '',
        formType: p.formType || '',
        formVariant: p.formVariant || '',
        quantity,
        basePrice,
        unitPrice: finalUnitPrice,
        discountAmount: discountAmount * quantity, // Total discount for all items
        discountType,
        totalPrice: quantity * finalUnitPrice,
        category: p.category || '',
        subcategory: p.subcategory || '',
        company: p.company || ''
      };
    });

    // create slip
    const newSlip = new Slip({
      customerName: customerName || 'Walk-in Customer',
      products: processedProducts,
      subtotal,
      totalAmount,
      status: 'Paid'
    });

    // reduce stock
    for (const update of productUpdates) {
      await Item.findByIdAndUpdate(
        update.itemId,
        { $inc: { quantity: -update.quantity }, lastUpdated: new Date() },
        { session }
      );
    }

    await newSlip.save({ session });

    // income record with slipId reference
    const incomeRecord = new Income({
      date: new Date(),
      totalIncome: totalAmount,
      productsSold: newSlip.products.map(p => ({
        productName: p.productName,
        sku: p.sku || '',
        productType: p.productType || 'Cover',
        coverType: p.coverType || '',
        plateCompany: p.plateCompany || '',
        bikeName: p.bikeName || '',
        plateType: p.plateType || '',
        formCompany: p.formCompany || '',
        formType: p.formType || '',
        formVariant: p.formVariant || '',
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        totalPrice: p.totalPrice,
        category: p.category || '',
        subcategory: p.subcategory || '',
        company: p.company || ''
      })),
      customerName: newSlip.customerName,
      paymentMethod: newSlip.paymentMethod || 'Cash',
      slipNumber: newSlip.slipNumber,
      slipId: newSlip._id,
      notes: `Sale from slip ${newSlip.slipNumber}`
    });

    await incomeRecord.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: 'Slip created successfully',
      slip: newSlip
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({ error: 'Failed to create slip', details: err.message });
  }
});

// UPDATE slip with inventory adjustment
router.put('/:id', async (req, res) => {
  const session = await Slip.startSession();
  session.startTransaction();

  try {
    const existingSlip = await Slip.findById(req.params.id).session(session);
    if (!existingSlip) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Slip not found' });
    }

    const { 
      customerName, 
      customerPhone,
      paymentMethod,
      notes,
      products,
      subtotal, 
      totalAmount, 
      tax,
      discount,
      status 
    } = req.body;

    // If products are being updated, adjust inventory
    if (products && Array.isArray(products)) {
      // First, restore original quantities to inventory
      if (existingSlip.products && existingSlip.products.length > 0) {
        for (const oldProduct of existingSlip.products) {
          const productName = oldProduct.productName;
          const oldQuantity = oldProduct.quantity;

          const inventoryItem = await Item.findOne({
            $or: [
              { name: { $regex: new RegExp(productName, 'i') } },
              { sku: { $regex: new RegExp(productName, 'i') } }
            ],
            isActive: true
          }).session(session);

          if (inventoryItem) {
            // Restore the old quantity
            await Item.findByIdAndUpdate(
              inventoryItem._id,
              { $inc: { quantity: oldQuantity }, lastUpdated: new Date() },
              { session }
            );
          }
        }
      }

      // Now, validate and reduce inventory for new quantities
      const productUpdates = [];
      for (const p of products) {
        const productName = p.productName || p.itemName;
        const quantity = p.quantity;

        if (!productName || !quantity || quantity <= 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ error: 'Invalid product data' });
        }

        const inventoryItem = await Item.findOne({
          $or: [
            { name: { $regex: new RegExp(productName, 'i') } },
            { sku: { $regex: new RegExp(productName, 'i') } }
          ],
          isActive: true
        }).session(session);

        if (!inventoryItem) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ error: `Product '${productName}' not found in inventory` });
        }

        // Check if we have enough stock (considering we already restored old quantity)
        const currentStock = inventoryItem.quantity;
        if (currentStock < quantity) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            error: `Insufficient stock for '${productName}'. Available: ${currentStock}`
          });
        }

        productUpdates.push({
          itemId: inventoryItem._id,
          quantity
        });
      }

      // Reduce stock for new quantities
      for (const update of productUpdates) {
        await Item.findByIdAndUpdate(
          update.itemId,
          { $inc: { quantity: -update.quantity }, lastUpdated: new Date() },
          { session }
        );
      }
    }

    // Update slip with all fields
    const updateData = {};
    if (customerName !== undefined) updateData.customerName = customerName;
    if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (notes !== undefined) updateData.notes = notes;
    if (subtotal !== undefined) updateData.subtotal = subtotal;
    if (totalAmount !== undefined) updateData.totalAmount = totalAmount;
    if (tax !== undefined) updateData.tax = tax;
    if (discount !== undefined) updateData.discount = discount;
    if (status !== undefined) updateData.status = status;
    // Helper function for bulk discount (same as in POST)
    const calculateBulkDiscount = (coverType, quantity, basePrice) => {
      const bulkDiscountTypes = [
        'Aster Cover',
        'Without Aster Cover',
        'Calendar Cover'
      ];
      
      if (bulkDiscountTypes.includes(coverType) && quantity >= 10) {
        return 10;
      }
      return 0;
    };

    if (products !== undefined) {
      updateData.products = products.map(p => {
        const productName = p.productName || p.itemName;
        const quantity = p.quantity;
        const basePrice = p.basePrice || p.unitPrice || p.price || 0;
        const coverType = p.coverType || '';
        const productType = p.productType || 'Cover';
        
        // Calculate bulk discount if applicable
        let discountAmount = 0;
        let discountType = 'none';
        
        if (productType === 'Cover' && coverType) {
          const bulkDiscount = calculateBulkDiscount(coverType, quantity, basePrice);
          if (bulkDiscount > 0) {
            discountAmount = bulkDiscount;
            discountType = 'bulk';
          }
        }
        
        // Manual discount/override
        const finalUnitPrice = p.unitPrice !== undefined ? p.unitPrice : (basePrice - discountAmount);
        
        if (p.unitPrice !== undefined && p.unitPrice !== (basePrice - discountAmount)) {
          discountType = 'manual';
          discountAmount = basePrice - finalUnitPrice;
        }
        
        return {
          productName,
          productType,
          coverType,
          plateCompany: p.plateCompany || '',
          bikeName: p.bikeName || '',
          plateType: p.plateType || '',
          quantity,
          basePrice,
          unitPrice: finalUnitPrice,
          discountAmount: discountAmount * quantity,
          discountType,
          totalPrice: quantity * finalUnitPrice,
          category: p.category || '',
          subcategory: p.subcategory || '',
          company: p.company || ''
        };
      });
    }
    if (status === 'Cancelled' && !existingSlip.cancelledAt) {
      updateData.cancelledAt = new Date();
      
      // Mark related income as inactive
      await Income.updateMany(
        { 
          $or: [
            { slipId: existingSlip._id },
            { slipNumber: existingSlip.slipNumber }
          ],
          isActive: true
        },
        { 
          isActive: false,
          notes: `Cancelled - ${existingSlip.slipNumber || existingSlip._id}`
        },
        { session }
      );

      // Restore inventory quantities for cancelled slip
      if (existingSlip.products && existingSlip.products.length > 0) {
        for (const product of existingSlip.products) {
          const productName = product.productName;
          const quantity = product.quantity;

          const inventoryItem = await Item.findOne({
            $or: [
              { name: { $regex: new RegExp(productName, 'i') } },
              { sku: { $regex: new RegExp(productName, 'i') } }
            ],
            isActive: true
          }).session(session);

          if (inventoryItem) {
            // Restore the quantity back to inventory
            await Item.findByIdAndUpdate(
              inventoryItem._id,
              { $inc: { quantity: quantity }, lastUpdated: new Date() },
              { session }
            );
          }
        }
      }
    }

    const updatedSlip = await Slip.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true, session }
    );

    // If products changed and slip is not cancelled, update income record
    if (products && Array.isArray(products) && status !== 'Cancelled') {
      const incomeUpdate = {
        totalIncome: totalAmount || updatedSlip.totalAmount,
        productsSold: updateData.products || products.map(p => ({
          productName: p.productName || p.itemName,
          sku: p.sku || '',
          productType: p.productType || 'Cover',
          coverType: p.coverType || '',
          plateCompany: p.plateCompany || '',
          bikeName: p.bikeName || '',
          plateType: p.plateType || '',
          quantity: p.quantity,
          unitPrice: p.unitPrice ?? p.price,
          totalPrice: p.totalPrice || (p.quantity * (p.unitPrice ?? p.price)),
          category: p.category || '',
          subcategory: p.subcategory || '',
          company: p.company || ''
        })),
        customerName: customerName || updatedSlip.customerName,
        paymentMethod: paymentMethod || updatedSlip.paymentMethod
      };

      await Income.updateMany(
        { 
          $or: [
            { slipId: existingSlip._id },
            { slipNumber: existingSlip.slipNumber }
          ],
          isActive: true
        },
        incomeUpdate,
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Slip updated successfully', slip: updatedSlip });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('❌ Error updating slip:', err);
    res.status(500).json({ error: 'Failed to update slip', details: err.message });
  }
});

// DELETE slip
router.delete('/:id', async (req, res) => {
  try {
    const deletedSlip = await Slip.findByIdAndDelete(req.params.id);
    if (!deletedSlip) return res.status(404).json({ error: 'Slip not found' });

    res.json({ message: 'Slip deleted successfully' });

  } catch (err) {
    res.status(500).json({ error: 'Failed to delete slip', details: err.message });
  }
});

module.exports = router;
