const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();
const { completeTransaction } = require('../models/Transaction');

router.get('/:session_id', async (req, res) => {
    try {
        const { session_id } = req.params;

        // Retrieve session details from Stripe
        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.status === 'complete') {
            console.log(`Session ${session_id} is complete. Completing the transaction...`);

            // Extract transaction ID from session metadata
            const transactionId = session.metadata.transactionId;

            // Mark the transaction as completed
            const transactionDetails = await completeTransaction(transactionId);

            console.log('Transaction completed successfully:', transactionDetails);

            // Render the success page with transaction details
            res.render('success', {
                sessionId: session_id,
                status: session.status,
                amountTotal: session.amount_total,
                currency: session.currency,
                itemName: transactionDetails.itemName,
            });
        } else {
            console.log(`Session ${session_id} is not complete.`);
            res.render('success', {
                sessionId: session_id,
                status: session.status,
                amountTotal: session.amount_total,
                currency: session.currency,
            });
        }
    } catch (error) {
        console.error('Error processing session:', error);
        res.status(500).send('An error occurred while processing the payment session.');
    }
});

module.exports = router;
