const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');

// Serve the register page
router.get('/submit', (req, res) => {
    res.render('submit-item', {
        pageTitle: 'Submit Item', headerText: 'Add a New Item',
    });
});

router.post('/create', async (req, res, next) => {
    try {
        const {title, description, category, price, startingBid, auctionEnd, quantity, imageUrl} = req.body;

        // Call the itemController with the data
        const item = await itemController.create({
            title,
            description,
            category,
            price: category === 'for sale' ? price : null,
            startingBid: category === 'auction' ? startingBid : null,
            auctionEnd: category === 'auction' ? auctionEnd : null,
            quantity,
            imageUrl,
        });

        res.status(201).json({message: 'Item created successfully', item});
    } catch (error) {
        console.error('Error creating item:', error);
        res.status(500).json({message: 'Failed to create item', error: error.message});
    }
});
router.get('/', itemController.list);
router.get('/:id', itemController.getById);

module.exports = router;
