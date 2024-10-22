const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const axios = require('axios'); // Use axios to fetch web pages
const { parse } = require('node-html-parser'); // node-html-parser for HTML parsing

// MySQL connection setup
const connection = mysql.createConnection({
    host: '3.19.85.118',
    user: 'COSC631',
    password: 'COSC631',
    database: 'searchEngine'
});

connection.connect((err) => {
    if (err) throw err;
    console.log('Connected to searchEngine database with robot.js');
});


// The /search route
router.get('/search', (req, res) => {
    const { query, operation } = req.query;
    
    if (!query) {
        return res.status(400).json({ error: 'No search query provided' });
    }

    const keywords = query.split(' ').filter(word => word.length > 2); // Minimum length 3 chars
    const operationType = operation === 'AND' ? 'AND' : 'OR'; // Default to OR

    let sqlQuery = 'SELECT DISTINCT url FROM urlKeyword WHERE ';
    const keywordConditions = keywords.map(keyword => `keyword LIKE '%${keyword}%'`).join(` ${operationType} `);

    sqlQuery += keywordConditions;

    connection.query(sqlQuery, (err, results) => {
        if (err) {
            console.error('Error executing search query:', err);
            return res.status(500).json({ error: 'Search query failed' });
        }

        if (results.length > 0) {
            res.json({ urls: results.map(row => row.url) });
        } else {
            res.json({ message: 'No results found' });
        }
    });
});

module.exports = router;
