const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();
const db = require('../config/db'); // Example DB connection

// Route to create a PaymentIntent and Checkout Session
router.post('/create-checkout-session', async (req, res) => {
    try {
        const { amount, itemId, transactionId, quantity } = req.body;
        const userId = req.session.userId; // Assuming the user is authenticated

        // Step 1: Create a PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // Stripe expects amounts in cents
            currency: 'usd',
            metadata: { itemId, userId, transactionId }, // Pass metadata for later use
        });

        // Step 2: Create a Checkout Session linked to the PaymentIntent
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `Purchase Item ${itemId}`,
                        },
                        unit_amount: amount * 100, // Amount in cents
                    },
                    quantity: quantity,
                },
            ],
            mode: 'payment',
            payment_intent_data: {
                setup_future_usage: 'on_session', // Optional: save card for reuse
            },
            success_url: `https://gerardcosc631.com/assignment4/success?session_id={CHECKOUT_SESSION_ID}`,
        });

        // Step 3: Store PaymentIntent details in your database (optional)
        await db.execute('INSERT INTO transactions (buyer_id, seller_id, item_id, amount, payment_intent_id) VALUES (?, ?, ?, ?, ?)',
            [userId, sellerId, itemId, amount, paymentIntent.id]);

        // Send the session ID to the frontend
        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;