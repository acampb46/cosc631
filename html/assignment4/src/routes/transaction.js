const express = require('express');
const {createTransaction, completeTransaction, getTransactionDetails} = require('../models/Transaction');
const Item = require('../controllers/itemController')
const db = require('../config/db');
const router = express.Router();

// Create a transaction (initiate payment)
router.post('/create', async (req, res) => {
    const {buyerId, sellerId, itemId, amount} = req.body;

    console.log(`Transaction Request: buyerId: ${buyerId}, sellerId: ${sellerId}, itemId: ${itemId}, amount: ${amount}.`);

    try {
        // Create a transaction record in the database
        const transaction = await createTransaction(buyerId, sellerId, itemId, amount);

        // Return success response (do not update quantity here)
        res.status(201).json({message: 'Transaction Successfully Created.', transactionId: transaction.transactionId});
    } catch (error) {
        console.error('Error during transaction creation:', error);
        res.status(500).json({message: error.message});
    }
});

// Complete a transaction (finalize transaction)
router.post('/complete', async (req, res) => {
    const { transactionId } = req.body;

    try {
        // Step 1: Complete the transaction and get transaction details
        const transaction = await completeTransaction(transactionId);

        // Step 2: Update item quantity using the updateQuantity logic
        const itemId = transaction.itemId;
        const newQuantity = transaction.quantity - 1; // Assuming quantity is decremented by 1

        if (newQuantity < 0) {
            return res.status(400).json({ message: 'Insufficient quantity for item.' });
        }

        // Notify via socket and update the database
        await Item.updateQuantity(itemId, newQuantity); // Calls the logic to update quantity and trigger socket

        // Step 3: Mark item as sold if quantity is 0
        if (newQuantity === 0) {
            await db.execute('UPDATE items SET status = ? WHERE id = ?', ['sold', itemId]);
        }

        res.status(200).json(transaction);
    } catch (error) {
        console.error('Error during transaction completion:', error);
        res.status(500).json({ message: error.message });
    }
});

// Get transaction details by ID
router.get('/:id', async (req, res) => {
    const {id} = req.params;

    try {
        const transaction = await getTransactionDetails(id);
        res.status(200).json(transaction);
    } catch (error) {
        res.status(500).json({message: error.message});
    }
});

module.exports = router;
