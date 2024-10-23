const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const puppeteer = require('puppeteer');
const { parse } = require('node-html-parser');

const k = 10; // Number of keywords to extract
const n = 500; // Minimum number of entries in urlDescription

// MySQL connection setup (promise-based)
const connection = mysql.createPool({
    host: '3.19.85.118',
    user: 'COSC631',
    password: 'COSC631',
    database: 'searchEngine',
    waitForConnections: true,
    connectionLimit: 10,  // Limit the number of connections
    queueLimit: 0
});

connection.connect((err) => {
    if (err) throw err;
    console.log('Connected to searchEngine database with start.js');
});

// Function to extract keywords and description from the HTML content
const extractKeywordsAndDescription = (root) => {
    let keywords = new Set();
    let description = '';

    const addKeywordsFromString = (str) => {
        str.split(/\s+/)
            .filter(word => word.length >= 3)
            .forEach(word => keywords.add(word));
    };

    // (a) Extract meta keywords
    const metaKeywords = root.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
        const keywordContent = metaKeywords.getAttribute('content');
        if (keywordContent) {
            addKeywordsFromString(keywordContent);
        }
    }

    // (b) Extract meta description
    const metaDescription = root.querySelector('meta[name="description"]');
    if (metaDescription) {
        description = metaDescription.getAttribute('content')?.slice(0, 200) || '';
    }

    return { keywords: Array.from(keywords).slice(0, k), description };
};

// Use an IIFE to enable dynamic import of p-limit
(async () => {
    const pLimit = (await import('p-limit')).default;

    const limit = pLimit(5); // Adjust concurrency limit based on needs

    // Function to start the crawling process
    const crawlUrls = async () => {
        let browser;

        try {
            // Launch a single browser instance
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const [results] = await connection.query('SELECT * FROM robotUrl ORDER BY pos');

            const crawlingPromises = results.map(row => limit(async () => {
                let nextUrl = row.url;
                if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://')) {
                    nextUrl = 'https://' + nextUrl; // Default to https
                }

                try {
                    const page = await browser.newPage();
                    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

                    console.log(`Crawling URL: ${nextUrl}`);
                    await page.goto(nextUrl, { waitUntil: 'networkidle0', timeout: 0 });
                    const html = await page.content();
                    await page.close(); // Close the page after crawling

                    const root = parse(html);
                    const { keywords, description } = extractKeywordsAndDescription(root);

                    // Insert description
                    await connection.query(
                        'INSERT INTO urlDescription (url, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description = ?',
                        [nextUrl, description, description]
                    );
                    console.log(`Inserted description for URL: ${nextUrl}`);

                    // Insert keywords
                    for (const keyword of keywords) {
                        const rank = (html.match(new RegExp(keyword, 'gi')) || []).length;
                        await connection.query(
                            'INSERT INTO urlKeyword (url, keyword, `rank`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `rank` = ?',
                            [nextUrl, keyword, rank, rank]
                        );
                        console.log(`Inserted keyword: ${keyword}, Rank: ${rank}`);
                    }

                    // Extract and insert new links into robotUrl
                    const links = root.querySelectorAll('a').map(link => link.getAttribute('href')).filter(href => href);
                    for (const link of links) {
                        const absoluteUrl = new URL(link, nextUrl).href;
                        const host = new URL(absoluteUrl).host;

                        const [countResults] = await connection.query('SELECT COUNT(*) AS count FROM robotUrl WHERE url = ?', [host]);
                        if (countResults[0].count === 0) {
                            await connection.query('INSERT INTO robotUrl (url) VALUES (?)', [host]);
                            console.log(`Inserted new URL to crawl: ${host}`);
                        }
                    }

                    // Check if the number of entries in urlDescription is below n
                    const [count] = await connection.query('SELECT COUNT(*) AS count FROM urlDescription');
                    if (count[0].count < n) {
                        console.log('Continuing to crawl due to insufficient entries in urlDescription');
                    }

                } catch (error) {
                    console.error(`Error crawling URL: ${nextUrl}`, error);
                }
            }));

            await Promise.all(crawlingPromises);
            console.log('Crawling complete.');

        } catch (error) {
            console.error('Error fetching URLs:', error);
            throw new Error('Error starting the crawling process');
        } finally {
            if (browser) {
                await browser.close(); // Ensure the browser is closed once all URLs are crawled
            }
        }
    };

    // Start the crawling process when the endpoint is hit
    router.get('/start', async (req, res) => {
        try {
            await crawlUrls();
            res.json({ message: 'Crawling process started.' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error starting crawling process' });
        }
    });
})();

module.exports = router;