const express = require('express');
const router = express.Router();
const bidController = require('../controllers/bidController');

router.post('/place', bidController.placeBid);
router.get('/highest/:itemId', bidController.getHighestBid);

module.exports = router;
