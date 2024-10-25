const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const axios = require('axios');
const { parse } = require('node-html-parser');

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

// Helper function to escape keywords for regex
const escapeKeyword = (keyword) => keyword.replace(/[-\/\\^$.*+?()[\]{}|]/g, '\\$&');

// The /search route
router.get('/search', async (req, res) => {
    const { query, operation } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'No search query provided' });
    }

    const keywords = [];
    const phrases = [];
    const splitQuery = query.match(/"([^"]+)"|'([^']+)'|\S+/g);

    splitQuery.forEach(item => {
        if (item.startsWith('"') || item.startsWith("'")) {
            phrases.push(item.slice(1, -1));
        } else if (item.length > 2) {
            keywords.push(item);
        }
    });

    const operationType = operation === 'AND' ? 'AND' : 'OR';
    const keywordConditions = keywords.map(keyword => `keyword LIKE '%${keyword}%'`).join(` ${operationType} `);
    let sqlQuery = `
        SELECT urlKeyword.url, urlDescription.description, SUM(urlKeyword.\`rank\`) AS \`rank\`
        FROM urlKeyword
                 JOIN urlDescription ON urlKeyword.url = urlDescription.url
        WHERE ${keywordConditions}
        GROUP BY urlKeyword.url
        ORDER BY \`rank\` DESC;
    `;

    connection.query(sqlQuery, async (err, results) => {
        if (err) {
            console.error('Error executing search query:', err);
            return res.status(500).json({ error: 'Search query failed' });
        }

        const finalResults = [];
        for (let row of results) {
            let rank = row.rank;
            let description = row.description;
            if (phrases.length > 0) {
                try {
                    const response = await axios.get(row.url);
                    const root = parse(response.data);
                    const bodyText = root.innerText;
                    phrases.forEach(phrase => {
                        const regex = new RegExp(escapeKeyword(phrase), 'gi');
                        rank += (bodyText.match(regex) || []).length;
                    });
                    description = description || bodyText.slice(0, 200).replace(/<[^>]+>/g, '');
                } catch (fetchError) {
                    console.error(`Failed to retrieve URL ${row.url}:`, fetchError.message);
                    continue;
                }
            }
            finalResults.push({ url: row.url, description, rank });
        }

        finalResults.sort((a, b) => b.rank - a.rank);
        res.json({ urls: finalResults });
    });
});

module.exports = router;
