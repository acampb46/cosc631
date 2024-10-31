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
    console.log("Browser launched successfully");
})();

async function getBrowser() {
    if (!browser || browser.isConnected() === false) {
        console.log("Launching a new browser instance...");
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

// Tokenize phrases into individual words
const tokenizePhrases = (phrases) => {
    return phrases.flatMap(phrase => phrase.split(/\s+/));
};

// Function to fetch HTML with Playwright for phrase-based matching
const fetchHtmlWithPlaywright = async (url) => {
    try {
        const browser = await getBrowser();
        const page = await browser.newPage();
        console.log(`Navigating to URL: ${url}`);
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
    const matchCount = (content.match(regex) || []).length;
    console.log(`Phrase "${phrase}" found ${matchCount} times`);
    return matchCount;
}

// Search route
router.get("/search", async (req, res) => {
    const { query, operator } = req.query;
    console.log("Search query received:", query);
    console.log("Operator selected:", operator);

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required.' });
    }

    // Extract keywords and exact phrases
    const searchTerms = query.match(/"[^"]+"|'[^']+'|\S+/g) || [];
    const phrases = searchTerms.filter(term => term.startsWith('"') || term.startsWith("'"))
        .map(term => term.replace(/['"]+/g, ''));
    const keywords = searchTerms.filter(term => !(term.startsWith('"') || term.startsWith("'")))
        .map(term => term.replace(/['"]+/g, ''));

    // Add tokenized phrases to keywords list for SQL search
    const allKeywords = [...keywords, ...tokenizePhrases(phrases)];
    const isAndOperation = operator === "AND" || (phrases.length > 0);

    console.log("Keywords extracted:", allKeywords);
    console.log("Phrases extracted:", phrases);
    console.log("Using AND operation:", isAndOperation);

    if (allKeywords.length === 0) {
        return res.json({ message: "no results" });
    }

    try {
        let sqlQuery;
        let values = [];

        if (isAndOperation) {
            const keywordConditions = allKeywords.map(() => "keyword LIKE ?").join(" OR ");
            values = allKeywords.map(term => `%${term}%`);
            sqlQuery = `
                SELECT url, COUNT(DISTINCT keyword) AS keywordCount, SUM(\`rank\`) AS totalRank
                FROM urlKeyword
                WHERE ${keywordConditions}
                GROUP BY url
                HAVING keywordCount = ?
            `;
            values.push(allKeywords.length);  // Ensure all keywords are present
            console.log("Executing AND query:", sqlQuery, values);
        } else {
            const keywordConditions = allKeywords.map(() => "keyword LIKE ?").join(" OR ");
            values = allKeywords.map(term => `%${term}%`);
            sqlQuery = `
                SELECT url, SUM(\`rank\`) AS totalRank
                FROM urlKeyword
                WHERE ${keywordConditions}
                GROUP BY url
            `;
            console.log("Executing OR query:", sqlQuery, values);
        }

        const [keywordResults] = await connection.query(sqlQuery, values);
        console.log("Keyword results:", keywordResults);

        if (keywordResults.length === 0) {
            console.log("No results found for query:", query);
            return res.json({ message: "no results" });
        }

        const results = await Promise.all(
            keywordResults.map(async ({ url, totalRank }) => {
                let finalRank = totalRank;
                console.log(`Processing URL: ${url}, initial rank: ${totalRank}`);

                if (phrases.length > 0) {
                    const pageContent = await fetchHtmlWithPlaywright(url);
                    if (pageContent) {
                        let phraseRank = 0;
                        for (const phrase of phrases) {
                            phraseRank += countExactPhrase(pageContent, phrase);
                        }

                        if (phraseRank > 0) {
                            console.log(`Phrase rank for URL ${url}: ${phraseRank}`);
                            finalRank = phraseRank;
                        }
                    } else {
                        console.log(`No content found for URL ${url}`);
                    }
                }

                const [descriptionRow] = await connection.query(
                    `SELECT description FROM urlDescription WHERE url = ? LIMIT 1`,
                    [url]
                );
                const description = descriptionRow.length ? descriptionRow[0].description : '';
                console.log(`URL: ${url}, final rank: ${finalRank}, description: ${description}`);

                return { url, description, rank: finalRank };
            })
        );

        const sortedResults = results.filter(Boolean).sort((a, b) => b.rank - a.rank);
        console.log("Final sorted results:", sortedResults);

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
