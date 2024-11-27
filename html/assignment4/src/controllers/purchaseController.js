const db = require('../config/db');
const transactionController = require('../controllers/transactionController');
const { createTransaction } = require('../models/Transaction');

const purchaseController = {
    async buyNow(req, res, next) {
        console.log("Entering buyNow logic");

        const { quantity } = req.body; // No paymentToken at this stage
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

            // Step 4: Redirect the user to the payment form
            res.render('paymentForm', {
                buyerId: userId,
                sellerId: item.seller_id,
                itemId,
                amount: totalPrice,
                transactionId,
            });
        } catch (error) {
            console.error('Error during purchase:', error);
            next(error);
        }
    },
};

module.exports = purchaseController;
