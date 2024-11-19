const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');

router.post('/buy', purchaseController.buyNow);

module.exports = router;
