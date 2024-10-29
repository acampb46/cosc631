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

    if (keywords.length === 0) {
        return res.status(400).json({ error: 'No valid keywords found.' });
    }

    try {
        // Step 1: Search for keywords
        let keywordSql = `SELECT url, SUM(rank) AS totalRank FROM urlKeyword`;
        const keywordConditions = keywords.map(() => `keyword LIKE ?`).join(isAndOperation ? ' AND ' : ' OR ');

        // Only add WHERE and conditions if there are keywords
        if (keywordConditions) {
            keywordSql += ` WHERE ${keywordConditions}`;
        }

        keywordSql += ` GROUP BY url`;
        const keywordValues = keywords.map(term => `%${term}%`);

        // Log the SQL and values for debugging
        console.log('Keyword SQL:', keywordSql);
        console.log('Keyword Values:', keywordValues);

        const [keywordResults] = await connection.query(keywordSql, keywordValues);

        // Filter results based on the operator
        let urls = [];
        if (isAndOperation) {
            // Filter URLs that have all keywords
            urls = keywordResults.filter(row => row.totalRank === keywords.length).map(row => ({ url: row.url, rank: row.totalRank }));
        } else {
            // Include URLs with any keyword matches
            urls = keywordResults.map(row => ({ url: row.url, rank: row.totalRank }));
        }

        // Step 2: Phrase handling (if any phrases)
        if (phrases.length > 0) {
            const phraseResults = await Promise.all(
                urls.map(async ({ url, rank }) => {
                    const pageContent = await fetchHtmlWithPlaywright(url);
                    let phraseCount = 0;
                    if (pageContent) {
                        phrases.forEach(phrase => {
                            phraseCount += countExactPhrase(pageContent, phrase);
                        });
                    }
                    return { url, rank: rank + phraseCount };
                })
            );

            urls = phraseResults;
        }

        // Step 3: Fetch descriptions for URLs
        const descriptionSql = `SELECT url, description FROM urlDescription WHERE url IN (?)`;
        const descriptionUrls = urls.map(result => result.url);
        const [descriptions] = await connection.query(descriptionSql, [descriptionUrls]);

        // Step 4: Combine results and send response
        const results = urls.map(({ url, rank }) => {
            const descriptionObj = descriptions.find(desc => desc.url === url);
            const description = descriptionObj ? descriptionObj.description : 'No description available';
            return { url, description, rank };
        });

        // Sort by rank
        results.sort((a, b) => b.rank - a.rank);

        res.json({ query, urls: results });
    } catch (error) {
        console.error('Error executing query:', error);
        res.status(500).json({ error: 'Database query failed.' });
    }

    process.on('exit', async () => {
        if (browser) await browser.close();
    });
});

module.exports = router;
