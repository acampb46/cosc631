const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

app.get('/dashboard', (req, res) => {
    const userItems = getUserItems(); // Fetch user's items
    const purchasedItems = getPurchasedItems(); // Fetch purchased items
    console.log("Rendering Dashboard.ejs");
    res.render('dashboard', {
        pageTitle: 'Your Dashboard',
        headerText: 'Welcome to Your Dashboard',
        userItems,
        purchasedItems
    });
});

router.get('/items', dashboardController.userItems);
router.get('/purchases', dashboardController.purchasedItems);

module.exports = router;
