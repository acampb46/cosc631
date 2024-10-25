const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const axios = require('axios');
const { parse } = require('node-html-parser');


require('dotenv').config();
// Environment Variables
const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbName = process.env.DB_NAME;

// MySQL connection pool
const connection = mysql.createPool({
    host: dbHost,
    user: dbUser,
    password: dbPassword,
    database: dbName
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

    const keywords = query.split(' ').filter(word => word.length > 2);
    const operationType = operation === 'AND' ? 'AND' : 'OR';

    // Query to sum ranks, retrieve descriptions, and order by rank descending
    let sqlQuery = `
        SELECT u.url, d.description, SUM(k.rank) AS totalRank
        FROM urlKeyword k
        JOIN urlDescription d ON k.url = d.url
        JOIN robotUrl u ON k.url = u.url
        WHERE `;

    // Add conditions for keywords based on operation type
    const keywordConditions = keywords.map(keyword => `k.keyword LIKE '%${keyword}%'`).join(` ${operationType} `);
    sqlQuery += `${keywordConditions}
        GROUP BY u.url
        ORDER BY totalRank DESC`;

    connection.query(sqlQuery, (err, results) => {
        if (err) {
            console.error('Error executing search query:', err);
            return res.status(500).json({ error: 'Search query failed' });
        }

        if (results.length > 0) {
            res.json(results.map(row => ({
                url: row.url,
                description: row.description,
                rank: row.totalRank
            })));
        } else {
            res.json({ message: 'No results found' });
        }
    });
});

module.exports = router;
