const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

router.get('/items', dashboardController.userItems);
router.get('/purchases', dashboardController.purchasedItems);

module.exports = router;
