const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

router.get('/:session_id', async (req, res) => {
    try {
        const { session_id } = req.params;

        // Retrieve session details from Stripe
        const session = await stripe.checkout.sessions.retrieve(session_id);

        let transactionDetails = null;

        if (session.status === 'complete') {
            console.log(`Session ${session_id} is complete. Completing the transaction...`);

            // Extract transaction ID from session metadata
            const transactionId = session.metadata.transactionId;

            // Fetch the transaction completion endpoint
            const response = await fetch('https://gerardcosc631.com/assignment4/transaction/complete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ transactionId }),
            });

            if (!response.ok) {
                throw new Error('Failed to complete the transaction.');
            }

            transactionDetails = await response.json(); // Parse the response
            console.log('Transaction completed successfully:', transactionDetails);
        }

        // Render the success page with or without transaction details
        res.render('success', {
            sessionId: session_id,
            status: session.status,
            amountTotal: session.amount_total,
            currency: session.currency,
            transactionDetails,
        });
    } catch (error) {
        console.error('Error processing session:', error);
        res.status(500).send('An error occurred while processing the payment session.');
    }
});

module.exports = router;
