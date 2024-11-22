const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');

// Middleware to handle file uploads
const multer = require('multer');
const upload = multer({ dest: 'public/images/' });

// Serve the register page
router.get('/submit', (req, res) => {
    res.render('submit-item', {
        pageTitle: 'Submit Item',
        headerText: 'Add a New Item',
    });
});

router.post('/create', itemController.create);
router.get('/', itemController.list);
router.get('/:id', itemController.getById);

module.exports = router;
