const db = require('../config/db');
const io = require('../socket');
const axios = require('axios');
const transactionController = require('../controllers/transactionController');
const { createTransaction } = require('../models/Transaction');

const purchaseController = {
    async buyNow(req, res, next) {
        console.log("Entering buyNow logic");
        const { itemId, quantity, paymentToken } = req.body;
        const userId = req.session.userId;

        try {
            // Step 1: Validate item availability
            const [itemRows] = await db.execute('SELECT * FROM items WHERE id = ?', [itemId]);
            const item = itemRows[0];

            if (!item) return res.status(404).send({ message: 'Item not found' });
            if (item.quantity < quantity) {
                return res.status(400).send({ message: 'Insufficient quantity available' });
            }

            // Step 2: Calculate total price
            const totalPrice = item.price * quantity;

            // Step 3: Process payment via `/payment/create`
            const paymentResponse = await axios.post(`/assignment4/payment/create`, {
                amount: totalPrice,
                token: paymentToken,
                buyerId: userId,
                sellerId: item.seller_id, // Assuming items table has a seller_id column
                itemId,
            });

            if (paymentResponse.status !== 200 || paymentResponse.data.paymentIntent.status !== 'succeeded') {
                return res.status(400).send({ message: 'Payment failed' });
            }

            // Step 4: Create a transaction
            const transaction = await createTransaction(
                userId,
                item.seller_id,
                itemId,
                totalPrice
            );

            // Step 5: Deduct item quantity
            await db.execute('UPDATE items SET quantity = quantity - ? WHERE id = ?', [quantity, itemId]);

            // Step 6: Emit real-time update for quantity
            io.to(`item-${itemId}`).emit('quantityUpdated', {
                itemId,
                newQuantity: item.quantity - quantity,
            });

            // Step 7: Send email notifications
            const buyerEmail = req.session.userEmail;
            const sellerEmail = await getSellerEmail(item.seller_id);
            const itemTitle = item.title;

            await transactionController.sendEmail(
                buyerEmail,
                'Purchase Confirmation',
                `You have successfully purchased "${itemTitle}" for $${totalPrice}.`
            );
            await transactionController.sendEmail(
                sellerEmail,
                'Sale Notification',
                `Your item "${itemTitle}" has been sold for $${totalPrice}.`
            );

            res.status(201).send({
                message: 'Purchase successful',
                transactionId: transaction.transactionId,
            });
        } catch (error) {
            console.error('Error during purchase:', error);
            next(error);
        }
    },
};

// Helper function to get seller email
async function getSellerEmail(sellerId) {
    const [sellerRows] = await db.execute('SELECT email FROM users WHERE id = ?', [sellerId]);
    return sellerRows.length ? sellerRows[0].email : null;
}

module.exports = purchaseController;
