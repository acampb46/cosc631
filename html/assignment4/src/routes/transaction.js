// routes/transactionRoutes.js
const express = require('express');
const { createTransaction, completeTransaction, getTransactionDetails } = require('../models/Transaction');
const router = express.Router();

// Create a transaction (purchase or auction win)
router.post('/create', async (req, res) => {
    const { buyerId, sellerId, itemId, amount } = req.body;

    try {
        const transaction = await createTransaction(buyerId, sellerId, itemId, amount);
        res.status(201).json(transaction);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Complete a transaction (e.g., after payment is processed)
router.post('/complete', async (req, res) => {
    const { transactionId } = req.body;

    try {
        const transaction = await completeTransaction(transactionId);
        res.status(200).json(transaction);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get transaction details by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const transaction = await getTransactionDetails(id);
        res.status(200).json(transaction);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
