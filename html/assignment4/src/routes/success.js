const express = require('express');
const router = express.Router();

router.get('/:session_id', (req, res) => {
    const { session_id } = req.params; // Extract session_id from URL parameters
    res.render('success', { sessionId: session_id }); // Pass session_id to the view
});

module.exports = router;
