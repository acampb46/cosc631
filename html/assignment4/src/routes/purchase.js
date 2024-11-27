const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');

router.post('/buyNow', purchaseController.buyNow);

module.exports = router;
