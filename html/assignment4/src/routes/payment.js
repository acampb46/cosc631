const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../config/db'); // Database connection
const router = express.Router();

//Route to render Payment Form
router.get('/create', (req, res) => {
    paymentDetails = req.session.paymentDetails;

    if (!paymentDetails) {
        return res.status(400).send('No payment details found');
    }

    console.log("Rendering paymentForm.ejs");
    res.render('paymentForm', paymentDetails);
});

// Route to create a payment
router.post('/create', async (req, res) => {
    const { transactionId } = req.body; // Get transactionId from the request body

    try {
        // Fetch transaction details from the database using the transactionId
        const [transactionRows] = await db.execute('SELECT * FROM transactions WHERE id = ?', [transactionId]);
        const transaction = transactionRows[0];

        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        // Extract relevant fields from the transaction record
        const { amount, buyer_id: buyerId, seller_id: sellerId, item_id: itemId, commission } = transaction;

        // Additional details for item
        const [itemRows] = await db.execute('SELECT title, description FROM items WHERE id = ?', [itemId]);
        const item = itemRows[0];

        if (!item) {
            return res.status(404).json({ message: 'Item not found for the transaction' });
        }

        // Create a payment intent on Stripe
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // Stripe expects the amount in cents
            currency: 'usd',
            description: `Payment for ${item.title} - ${item.description}`,
            metadata: {
                transactionId,
                buyerId,
                sellerId,
                itemId,
                commission,
            },
            automatic_payment_methods: { enabled: true }, // Enable Stripe's automatic payment method flow
        });

        res.status(200).json({
            message: 'Payment intent created successfully',
            paymentIntent,
        });
    } catch (error) {
        console.error('Error during payment processing:', error);

        // Update transaction status to failed if payment fails
        if (transactionId) {
            await db.execute('UPDATE transactions SET status = ? WHERE id = ?', ['failed', transactionId]);
        }

        res.status(500).json({ message: 'Payment failed', error: error.message });
    }
});

module.exports = router;
