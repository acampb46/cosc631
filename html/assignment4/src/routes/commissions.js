const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Adjust path to your db configuration

router.get('/', async (req, res) => {
    try {
        // Fetch all commission rows with transaction details
        const [rows] = await db.execute(`
            SELECT 
                c.id AS commission_id, 
                c.commission_amount, 
                c.created_at, 
                t.item_id
            FROM commissions c
            JOIN transactions t ON c.purchase_id = t.id
            ORDER BY c.created_at DESC
        `);

        // Summarize commission by time frame for the graph
        const [graphData] = await db.execute(`
            SELECT 
                DATE(created_at) AS date, 
                SUM(commission_amount) AS total_commission 
            FROM commissions 
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at)
        `);

        res.render('commission', { commissions: rows, graphData });
    } catch (error) {
        console.error('Error fetching commissions:', error);
        res.status(500).send('An error occurred while fetching commission data.');
    }
});

module.exports = router;
