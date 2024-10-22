// routes/parser.js

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { parse } = require('node-html-parser');

// Recursively count tags from URL
function countTags(node, tags) {
    // Check if it's an element node and tagName is not null or undefined
    if (node.nodeType === 1 && node.tagName) {
        const tagName = node.tagName.toLowerCase();
        tags[tagName] = (tags[tagName] || 0) + 1;
    }

    // Recursively go through child nodes
    if (node.childNodes && node.childNodes.length > 0) {
        node.childNodes.forEach(child => {
            countTags(child, tags);
        });
    }
}

// Post function for parser
router.post('/', async (req, res) => {
    let { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required.' });
    }
	
	// Ensure the URL starts with https://www.
    if (!url.startsWith('https://www.')) {
		if (url.startsWith('www.')) {
			url = 'https://' + url; // Add https:// if it's missing
		}
		else {
			url = 'https://www.' + url;
		}
    }

    try {
        // Fetch the HTML content from the url using appropriate headers to
		// mimic a browser
		console.log('Fetching HTML content...');
        const response = await axios.get(url, {
                        headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
				"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.9",
				"Accept-Encoding": "gzip, deflate, br",
				"Connection": "keep-alive",
				"Upgrade-Insecure-Requests": "1",
            }
        });
        const html = response.data;

        // Parse HTML returned from the url
        const root = parse(html);
		console.log('HTML parsed:', root.toString());
		
        const tags = {};

        // Traverse DOM tree and count unique tags
        countTags(root,tags);
		
		console.log('Tags counted:', tags);

        // Clear the table
        req.db.query('DELETE FROM htmlTags', (err) => { // Use req.db here
            if (err) throw err;

            // Insert new tags into the database
            const tagEntries = Object.entries(tags).map(([tag, count]) => [tag, count]);
            req.db.query('INSERT INTO htmlTags (tag, count) VALUES ?', [tagEntries], (err) => {
                if (err) throw err;

                // Respond with the count of unique tags
                res.json({ uniqueCount: Object.keys(tags).length });
            });
        });
    } catch (error) {
    if (error.response) {
            console.error('Response error:', error.response.data);
        } else if (error.request) {
            console.error('Request error:', error.request);
        } else {
            console.error('Error:', error.message);
        }
}
});

module.exports = router;
