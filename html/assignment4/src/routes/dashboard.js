const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Serve Dashboard.ejs from /dashboard route
router.get('/load', async (req, res) => {
    try {
        // Fetch user items and purchased items
        const userItems = await dashboardController.userItems(req, res, next);
        const purchasedItems = await dashboardController.purchasedItems(req, res, next);

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

// Correctly attach controller methods to the route
router.get('/items', (req, res, next) => dashboardController.userItems(req, res, next));
router.get('/purchases', (req, res, next) => dashboardController.purchasedItems(req, res, next));

module.exports = router;
