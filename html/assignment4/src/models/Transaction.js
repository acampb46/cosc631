const db = require('../config/db'); // Your database connection
const {sendEmail} = require('../utils/notificationUtils'); // Optional notification utility

module.exports = {
    // Create a transaction
    createTransaction: async (buyerId, sellerId, itemId, amount) => {
        const commission = amount * 0.05; // 5% commission
        const totalAmount = amount - commission; // Seller gets the total amount minus the commission

        console.log("Creating Transaction...");

        try {
            // Start a database transaction
            const [result] = await db.execute('INSERT INTO transactions (buyer_id, seller_id, item_id, amount, status, transaction_date) VALUES (?, ?, ?, ?, ?, NOW())', [buyerId, sellerId, itemId, amount, 'pending']);

            // Get the transaction ID
            const transactionId = result.insertId;

            // Return transaction details
            return {
                transactionId, buyerId, sellerId, itemId, amount, commission, totalAmount, status: 'pending', // Initially pending until payment is processed
            };
        } catch (error) {
            console.error('Error creating transaction:', error);
            throw new Error('Transaction creation failed');
        }
    },

    // Complete a transaction (sends notifications)
    completeTransaction: async (transactionId) => {
        try {
            // Update the status of the transaction to 'completed'
            const [updateResult] = await db.execute('UPDATE transactions SET status = ? WHERE id = ?', ['completed', transactionId]);

            if (updateResult.affectedRows === 0) {
                throw new Error('Transaction not found');
            }

            // Fetch transaction details
            const [transactionRows] = await db.execute('SELECT * FROM transactions WHERE id = ?', [transactionId]);
            const transaction = transactionRows[0];

            const [commissionResult] = await db.execute('INSERT INTO commissions (purchase_id, commission_amount) VALUES (?,?)', [transactionId, transaction.commission]);
            const commissionId = commissionResult[0];

            // Fetch additional details
            const [itemRows] = await db.execute('SELECT title, quantity FROM items WHERE id = ?', [transaction.item_id]);
            const itemTitle = itemRows[0].title;
            const quantity = itemRows[0].quantity;

            const [buyerRows] = await db.execute('SELECT email FROM users WHERE id = ?', [transaction.buyer_id]);
            const [sellerRows] = await db.execute('SELECT email FROM users WHERE id = ?', [transaction.seller_id]);

            const buyerEmail = buyerRows[0].email;
            const sellerEmail = sellerRows[0].email;

            // Send email notifications to both buyer and seller
            await Promise.all([sendEmail(buyerEmail, 'Purchase Confirmation', `You have successfully purchased "${itemTitle}" for $${transaction.amount}.`), sendEmail(sellerEmail, 'Sale Notification', `Your item "${itemTitle}" has been sold for $${transaction.amount}.`),]);

            // Return the completed transaction details
            return {
                transactionId,
                status: 'completed',
                buyerId: transaction.buyer_id,
                sellerId: transaction.seller_id,
                itemId: transaction.item_id, // Needed for quantity update
                amount: transaction.amount,
                quantity,
            };
        } catch (error) {
            console.error('Error completing transaction:', error);
            throw new Error('Transaction completion failed');
        }
    },

    // Get transaction details by transactionId
    getTransactionDetails: async (transactionId) => {
        try {
            const [result] = await db.execute('SELECT * FROM transactions WHERE id = ?', [transactionId]);

            if (result.length === 0) {
                throw new Error('Transaction not found');
            }

            return result[0]; // Return the transaction details
        } catch (error) {
            console.error('Error fetching transaction details:', error);
            throw new Error('Failed to fetch transaction details');
        }
    },
};
