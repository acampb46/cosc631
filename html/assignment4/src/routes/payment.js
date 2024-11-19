// routes/paymentRoutes.js
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createTransaction } = require('../models/Transaction'); // Your transaction model
const router = express.Router();

// Route to create a payment
router.post('/payment/create', async (req, res) => {
    const { amount, token, buyerId, sellerId, itemId } = req.body;

    try {
        // Create a payment intent on Stripe
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // Stripe amount is in cents
            currency: 'usd',
            payment_method: token.id, // The payment method ID from the frontend
            confirm: true, // Confirm the payment immediately
        });

        // If payment is successful, create a transaction
        if (paymentIntent.status === 'succeeded') {
            const transaction = await createTransaction(buyerId, sellerId, itemId, amount);
            res.status(200).json({
                message: 'Payment successful',
                transaction,
                paymentIntent,
            });
        } else {
            res.status(400).json({ message: 'Payment failed' });
        }
    } catch (error) {
        console.error('Error during payment processing:', error);
        res.status(500).json({ message: 'Payment failed', error: error.message });
    }
});

module.exports = router;
