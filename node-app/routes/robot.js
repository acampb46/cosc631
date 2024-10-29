const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { chromium } = require('playwright-extra');
const stealth = require("puppeteer-extra-plugin-stealth")();
require('dotenv').config();

const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbName = process.env.DB_NAME;

let connection;
let browser;

(async () => {
    chromium.use(stealth);
    browser = await chromium.launch({ headless: true });
})();

async function getBrowser() {
    if (!browser || browser.isConnected() === false) {
        browser = await chromium.launch({ headless: true });
    }
    return browser;
}

async function initializeDatabase() {
    connection = await mysql.createConnection({
        host: dbHost, user: dbUser, password: dbPassword, database: dbName
    });
    console.log('Connected to the database');
}

initializeDatabase().catch(err => {
    console.error('Failed to connect to the database:', err);
});

// Function to fetch HTML with Playwright for phrase-based matching
const fetchHtmlWithPlaywright = async (url) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
        const browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        await sleep(Math.floor(Math.random() * 4000 + 1000)); // Random wait time
        const content = await page.content();
        await page.close();
        return content;
    } catch (error) {
        console.error(`Error navigating to URL with Playwright ${url}:`, error);
    }
};

// Function to calculate occurrences of exact phrases
function countExactPhrase(content, phrase) {
    const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
    return (content.match(regex) || []).length;
}

// Search route
router.get("/search", async (req, res) => {
    const { query, operator } = req.query;
    const isAndOperation = operator === "AND";

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required.' });
    }

    // Extract keywords and phrases, allowing for multiple phrases
    const searchTerms = query.match(/"[^"]+"|'[^']+'|\S+/g) || [];
    const phrases = searchTerms.filter(term => term.startsWith('"') || term.startsWith("'")).map(term => term.replace(/['"]+/g, ''));
    const keywords = searchTerms.filter(term => !(term.startsWith('"') || term.startsWith("'"))).map(term => term.replace(/['"]+/g, ''));

    console.log('Phrases:', phrases); // Debug log for phrases
    console.log('Keywords:', keywords); // Debug log for keywords

    if (phrases.length === 0 && keywords.length === 0) {
        return res.status(400).json({ error: 'No valid keywords or phrases found.' });
    }

    try {
        // Build SQL query based on the operator
        const operatorSql = isAndOperation ? 'AND' : 'OR';
        const keywordConditions = keywords.map(() => `keyword LIKE ?`).join(` ${operatorSql} `);
        let sql = `SELECT urlKeyword.url, urlDescription.description, SUM(urlKeyword.rank) AS totalRank
                   FROM urlKeyword
                   JOIN urlDescription ON urlDescription.url = urlKeyword.url
                   WHERE ${keywordConditions}`;

        // If there are phrases, include them in the WHERE clause
        if (phrases.length > 0) {
            const phraseConditions = phrases.map(() => `description LIKE ?`).join(` ${operatorSql} `);
            sql += ` AND (${phraseConditions})`;
        }

        sql += ` GROUP BY urlKeyword.url`;

        // If AND operation, ensure all keywords exist for a single URL
        if (isAndOperation) {
            sql += ` HAVING COUNT(DISTINCT urlKeyword.keyword) = ?`;
        }

        const values = [...keywords.map(term => `%${term}%`)];
        if (phrases.length > 0) {
            values.push(...phrases.map(term => `%${term}%`));
        }
        if (isAndOperation) {
            values.push(keywords.length);
        }

        console.log('SQL:', sql); // Debug log for SQL query
        console.log('Values:', values); // Debug log for query values

        const [rows] = await connection.query(sql, values);

        console.log('Rows:', rows); // Debug log for rows returned

        if (rows.length === 0) {
            return res.json({ query, urls: [] }); // Return empty if no rows found
        }

        const results = await Promise.all(
            rows.map(async ({ url, description, totalRank }) => {
                // Count occurrences for all phrases
                for (const cleanPhrase of phrases) {
                    if (description.includes(cleanPhrase)) {
                        // Fetch the content from the URL
                        const pageContent = await fetchHtmlWithPlaywright(url);
                        if (pageContent) {
                            totalRank += countExactPhrase(pageContent, cleanPhrase);
                        }
                    }
                }

                // Count occurrences for individual keywords found in the description or fetched content
                keywords.forEach(keyword => {
                    if (description.includes(keyword)) {
                        totalRank += 1; // Adjust this logic based on your ranking criteria
                    }
                });

                return { url, description, rank: totalRank };
            })
        );

        // Filter unique URLs and sort by rank
        const uniqueResults = Array.from(new Set(results.map(r => r.url)))
            .map(url => results.find(r => r.url === url));

        const sortedResults = uniqueResults.filter(Boolean).sort((a, b) => b.rank - a.rank);

        res.json({ query, urls: sortedResults });
    } catch (error) {
        console.error('Error executing query:', error);
        res.status(500).json({ error: 'Database query failed.' });
    }

    process.on('exit', async () => {
        if (browser) await browser.close();
    });
});







module.exports = router;
