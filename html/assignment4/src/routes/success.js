const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    //const { session_id } = req.params; // Extract session_id from URL parameters
    //res.render('success', { sessionId: session_id }); // Pass session_id to the view
    res.render('success');
});

module.exports = router;
