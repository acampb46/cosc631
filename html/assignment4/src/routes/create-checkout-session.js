const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();
const db = require('../config/db');

// Route to create a PaymentIntent and Checkout Session
router.post('/', async (req, res) => {
    console.log('Reached Checkout Session Creation...');
    try {
        const { transactionId } = req.body; // Pass transactionId in the request
        const userId = req.session.userId; // Assuming the user is authenticated

        if (!transactionId) {
            return res.status(400).json({ error: 'Transaction ID is required.' });
        }

        console.log('Fetching transaction details...');
        // Fetch transaction details from the database
        const [transactionRows] = await db.execute(
            'SELECT amount, commission, item_id, seller_id FROM transactions WHERE id = ? AND buyer_id = ?',
            [transactionId, userId]
        );

        if (transactionRows.length === 0) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        const { amount, item_id: itemId, quantity } = transactionRows[0];

        console.log('Creating Payment Intent...');
        // Step 1: Create a PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // Stripe expects amounts in cents
            currency: 'usd',
            metadata: { itemId, userId, transactionId }, // Pass metadata for later use
        });



        console.log('Creating Checkout Session...');
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
                    quantity: 1,
                },
            ],
            mode: 'payment',
            payment_intent_data: {
                setup_future_usage: 'on_session', // Optional: save card for reuse
            },
            //client_secret: paymentIntent.client_secret,
            ui_mode: 'embedded',
            return_url: `https://gerardcosc631.com/assignment4/dashboard/load`
        });

        console.log('Updating Payment Details in Database...');
        // Step 3: Update the PaymentIntent details in the database
        await db.execute(
            'UPDATE transactions SET payment_intent_id = ? WHERE id = ?',
            [paymentIntent.id, transactionId]
        );

        // Send the session ID to the frontend
        res.status(201).json({clientSecret: session.client_secret});
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
