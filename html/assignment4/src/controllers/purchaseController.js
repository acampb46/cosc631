const db = require('../config/db');
const axios = require('axios');
const { createTransaction } = require('../models/Transaction');

const purchaseController = {
    async buyNow(req, res, next) {
        console.log("Entering buyNow logic");

        const { quantity } = req.body;
        const userId = req.session.userId; // Assuming the user is authenticated
        const itemId = parseInt(req.body.itemId, 10);

        try {
            // Step 1: Validate item availability
            const [itemRows] = await db.execute('SELECT * FROM items WHERE id = ? AND status = ?', [itemId, 'available']);
            const item = itemRows[0];

            if (!item) return res.status(404).send({ message: 'Item not found' });
            if (item.quantity < quantity) return res.status(400).send({ message: 'Insufficient quantity available' });

            // Step 2: Calculate total price
            const totalPrice = item.price * quantity;

            // Step 3: Create the transaction record
            const transactionResponse = await createTransaction(userId, item.seller_id, itemId, totalPrice);
            const { transactionId } = transactionResponse;

            console.log({
                buyerId: userId,
                sellerId: item.seller_id,
                itemId,
                amount: totalPrice,
                transactionId,
            });

            // Step 4: Call /payment/create to get payment intent
            const paymentCreateUrl = `https://gerardcosc631.com/assignment4/payment/create`;
            const paymentResponse = await axios.post(paymentCreateUrl, { transactionId });

            if (paymentResponse.status !== 200) {
                throw new Error(paymentResponse.data.message || 'Failed to create payment intent');
            }

            const { paymentIntent } = paymentResponse.data;

            // Step 5: Render the payment form with all required details
            console.log("Rendering Payment form with payment intent details");
            res.render('paymentForm', {
                buyerId: userId,
                sellerId: item.seller_id,
                itemId,
                amount: totalPrice,
                transactionId,
                clientSecret: paymentIntent.client_secret, // Add this for Stripe PaymentIntent
            });
        } catch (error) {
            console.error('Error during purchase:', error);
            next(error);
        }
    },
};

module.exports = purchaseController;
