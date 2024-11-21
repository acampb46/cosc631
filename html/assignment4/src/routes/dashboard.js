const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Serve Dashboard.ejs from /dashboard route
router.get('/load', async (req, res, next) => {
    try {
        // Fetch user items and purchased items
        const userItems = await dashboardController.userItems(req, res, next);
        const purchasedItems = await dashboardController.purchasedItems(req, res, next);

        // Render the dashboard.ejs view and pass the data
        res.render('dashboard', {
            console.log("Rendering dashboard.ejs")
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

// Attach controller methods to their respective routes
router.get('/items', dashboardController.userItems);
router.get('/purchases', dashboardController.purchasedItems);

module.exports = router;
