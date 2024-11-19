const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');

// Middleware to handle file uploads
const multer = require('multer');
const upload = multer({ dest: 'public/images/' });

router.post('/create', upload.single('image'), itemController.create);
router.get('/', itemController.list);
router.get('/:id', itemController.getById);

module.exports = router;
