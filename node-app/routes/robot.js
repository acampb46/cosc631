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
    try {
        const browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
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

    // Extract keywords and exact phrases
    const searchTerms = query.match(/"[^"]+"|'[^']+'|\S+/g) || [];
    const phrases = searchTerms.filter(term => term.startsWith('"') || term.startsWith("'")).map(term => term.replace(/['"]+/g, ''));
    const keywords = searchTerms.filter(term => !(term.startsWith('"') || term.startsWith("'"))).map(term => term.replace(/['"]+/g, ''));

    try {
        // SQL to match keywords, with HAVING clause for AND operation
        const keywordConditions = keywords.map(() => "keyword LIKE ?").join(isAndOperation ? " OR " : " OR ");
        const keywordValues = keywords.map(term => `%${term}%`);

        let sqlQuery = `SELECT url, SUM(\`rank\`) AS totalRank FROM urlKeyword WHERE ${keywordConditions} GROUP BY url`;

        // For AND, ensure URLs contain all keywords using HAVING clause
        if (isAndOperation) {
            sqlQuery += ` HAVING COUNT(DISTINCT keyword) = ?`;
            keywordValues.push(keywords.length);
        }

        const [keywordResults] = await connection.query(sqlQuery, keywordValues);

        // Process results, handling any exact phrase matching
        const results = await Promise.all(
            keywordResults.map(async ({ url, totalRank }) => {
                let totalRankWithPhrases = totalRank;

                // If there are phrases, ensure they appear in content
                for (const phrase of phrases) {
                    const pageContent = await fetchHtmlWithPlaywright(url);
                    if (pageContent) {
                        totalRankWithPhrases += countExactPhrase(pageContent, phrase);
                    }
                }

                // Fetch the description for display only, not for keyword matching
                const [descriptionRow] = await connection.query(
                    `SELECT description FROM urlDescription WHERE url = ? LIMIT 1`,
                    [url]
                );
                const description = descriptionRow.length ? descriptionRow[0].description : '';

                return { url, description, rank: totalRankWithPhrases };
            })
        );

        const sortedResults = results.filter(Boolean).sort((a, b) => b.rank - a.rank);
        res.json({ query, urls: sortedResults });
    } catch (error) {
        console.error('Error executing query:', error);
        res.status(500).json({ error: 'Database query failed.', details: error.message });
    }

    process.on('exit', async () => {
        if (browser) await browser.close();
    });
});

module.exports = router;
