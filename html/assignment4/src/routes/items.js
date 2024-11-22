const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');

// Serve the register page
router.get('/submit', (req, res) => {
    res.render('submit-item', {
        pageTitle: 'Submit Item', headerText: 'Add a New Item',
    });
});

router.post('/create', async (req, res, next) => {  // Make sure 'next' is here
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
        next(error); // Pass the error to the next middleware (i.e., error handler)
    }
});
router.get('/', itemController.list);
router.get('/:id', itemController.getById);

module.exports = router;
