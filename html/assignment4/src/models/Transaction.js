// models/Transaction.js
const db = require('../config/db'); // Your database connection
const { sendEmail, sendTextMessage } = require('../utils/notificationUtils'); // Optional notification utility

module.exports = {
    // Create a transaction
    createTransaction: async (buyerId, sellerId, itemId, amount) => {
        const commission = amount * 0.05; // 5% commission
        const totalAmount = amount - commission; // Seller gets the total amount minus the commission

        try {
            // Start a database transaction
            const [result] = await db.execute(
                'INSERT INTO transactions (buyer_id, seller_id, item_id, amount, status, transaction_date) VALUES (?, ?, ?, ?, ?, NOW())',
                [buyerId, sellerId, itemId, totalAmount, commission, 'pending']
            );

            // Get the transaction ID
            const transactionId = result.insertId;

            // Optionally, send email or SMS notifications to buyer and seller
            const item = await db.execute('SELECT title FROM items WHERE id = ?', [itemId]);
            const itemTitle = item[0][0].title;

            const buyer = await db.execute('SELECT email FROM users WHERE id = ?', [buyerId]);
            const seller = await db.execute('SELECT email FROM users WHERE id = ?', [sellerId]);

            const buyerEmail = buyer[0][0].email;
            const sellerEmail = seller[0][0].email;

            // Send transaction confirmation emails (or SMS)
            await sendEmail(
                buyerEmail,
                'Transaction Confirmation',
                `You have successfully purchased "${itemTitle}" for $${amount}. The seller will be notified of the transaction.`
            );
            await sendEmail(
                sellerEmail,
                'Transaction Confirmation',
                `You have successfully sold "${itemTitle}" for $${amount}. The buyer has been notified of the transaction.`
            );

            // After a successful transaction, update the item status to sold or completed
            await db.execute('UPDATE items SET status = ? WHERE id = ?', ['sold',itemId]);

            // Return transaction details
            return {
                transactionId,
                buyerId,
                sellerId,
                itemId,
                amount,
                commission,
                totalAmount,
                status: 'pending', // Initially, pending until confirmed or processed
            };
        } catch (error) {
            console.error('Error creating transaction:', error);
            throw new Error('Transaction creation failed');
        }
    },

    // Complete a transaction
    completeTransaction: async (transactionId) => {
        try {
            // Update the status of the transaction to 'completed'
            const [result] = await db.execute(
                'UPDATE transactions SET status = ? WHERE id = ?',
                ['completed',transactionId]
            );

            if (result.affectedRows === 0) {
                throw new Error('Transaction not found');
            }

            // You can add other logic here, such as updating user balances, etc.
            return { transactionId, status: 'completed' };
        } catch (error) {
            console.error('Error completing transaction:', error);
            throw new Error('Transaction completion failed');
        }
    },

    // Get transaction details by transactionId
    getTransactionDetails: async (transactionId) => {
        try {
            const [result] = await db.execute(
                'SELECT * FROM transactions WHERE id = ?',
                [transactionId]
            );

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
