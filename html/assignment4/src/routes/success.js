const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

router.get('/:session_id', async (req, res) => {
    const {session_id} = req.params; // Extract session_id from URL parameters

    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.render('success', {sessionId: session_id, status: session.status, amountTotal: session.amount_total, currency: session.currency}); // session information to the view
});

module.exports = router;
