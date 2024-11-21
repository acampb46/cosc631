const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Serve Dashboard.ejs from /dashboard route
router.get('/dashboard', async (req, res) => {
    try {
        // Fetch user items and purchased items
        const userItems = await dashboardController.userItems(req, res);
        const purchasedItems = await dashboardController.purchasedItems(req, res);

        // Render the dashboard.ejs view and pass the data
        res.render('dashboard', {
            pageTitle: 'Your Dashboard',
            headerText: 'Welcome to Your Dashboard',
            userItems,  // Pass userItems data to the view
            purchasedItems // Pass purchasedItems data to the view
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching data');
    }
});

// These routes handle fetching data (items and purchases) via API calls
router.get('/items', dashboardController.userItems);
router.get('/purchases', dashboardController.purchasedItems);

module.exports = router;
