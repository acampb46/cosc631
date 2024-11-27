// routes/transactionRoutes.js
const express = require('express');
const { createTransaction, completeTransaction, getTransactionDetails } = require('../models/Transaction');
const router = express.Router();

// Create a transaction (purchase or auction win)
// Add Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Replace with your Stripe secret key

router.post('/create', async (req, res) => {
    const { token, buyerId, sellerId, itemId, amount } = req.body;
    console.log(`Transaction Request: buyerId: ${buyerId}, sellerId: ${sellerId}, itemId: ${itemId}, amount: ${amount}.`);

    try {
        // Step 1: Charge the card using Stripe
        const charge = await stripe.charges.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'usd',
            source: token,
            description: `Purchase of item ${itemId} by buyer ${buyerId}`,
        });

        if (charge.status !== 'succeeded') {
            return res.status(400).json({ message: 'Payment failed' });
        }

        // Step 2: Create a transaction record in the database
        const transaction = await createTransaction(buyerId, sellerId, itemId, amount);

        // Step 3: Update item availability (optional)
        await db.execute('UPDATE items SET quantity = quantity - 1 WHERE id = ?', [itemId]);

        // Return success response
        res.status(201).json({ message: 'Payment successful', transactionId: transaction.id });
    } catch (error) {
        console.error('Error during transaction creation:', error);
        res.status(500).json({ message: error.message });
    }
});

// Complete a transaction (e.g., after payment is processed)
router.post('/complete', async (req, res) => {
    const { transactionId } = req.body;

    try {
        const transaction = await completeTransaction(transactionId);
        res.status(200).json(transaction);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get transaction details by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const transaction = await getTransactionDetails(id);
        res.status(200).json(transaction);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
