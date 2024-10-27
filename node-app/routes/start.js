const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const {chromium} = require('playwright-extra');
const stealth = require("puppeteer-extra-plugin-stealth")();
const {parse} = require('node-html-parser');

require('dotenv').config();
// Environment Variables
const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbName = process.env.DB_NAME;

// Constants
const k = 10; // Number of keywords to extract
const n = 500; // Minimum number of entries in urlDescription

// MySQL connection pool
const connection = mysql.createPool({
    host: dbHost,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test the database connection
async function testConnection() {
    try {
        const conn = await connection.getConnection();
        console.log('Connected to searchEngine database with start.js');
        conn.release();
    } catch (err) {
        console.error('Error connecting to the database:', err);
    }
}

testConnection();

// Function to extract keywords and description from the HTML content
const extractKeywordsAndDescription = (root) => {
    let keywords = new Set();
    let description = '';

    const addKeywordsFromString = (str) => {
        const unwantedPatterns = [/<[^>]+>/g,  // Ignore HTML tags
            /src=["'][^"']*["']/g, // Ignore src attributes
            /href=["'][^"']*["']/g, // Ignore href attributes
            /[^\w\s]/g, // Ignore non-word characters (punctuation, etc.)
            /(?:^| )\w{1,2}(?:$| )/g, // Ignore short words (1-2 letters)
        ];

        unwantedPatterns.forEach(pattern => {
            str = str.replace(pattern, ' ');
        });

        str.split(/\s+/)
            .filter(word => word.length >= 3) // Ensure keyword is at least 3 characters
            .forEach(word => keywords.add(word));
    };

    // Check meta description tags first
    const metaDescription = root.querySelector('meta[name="description"]') || root.querySelector('meta[property="og:description"]');
    if (metaDescription) {
        description = metaDescription.getAttribute('content') || '';
        description = description.slice(0, 200); // Limit to 200 characters
        console.log('Meta description found:', description);
    }

    // Check meta keyword tag
    const metaKeywords = root.querySelector('meta[name="keyword"]') || root.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
        let keywordsContent = metaKeywords.getAttribute('content') || '';
        addKeywordsFromString(keywordsContent);
        console.log('Meta keywords found:', keywordsContent);
    }

    // If no description has been set, fall back to the title tag
    if (!description) {
        const titleTag = root.querySelector('title');
        if (titleTag) {
            addKeywordsFromString(titleTag.text);
            description = titleTag.text.slice(0, 200); // Limit to 200 characters
            console.log('Fallback to title tag:', description);
        }
    }

    // If still no description, check headings
    if (!description) {
        const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
        for (let heading of headings) {
            addKeywordsFromString(heading.text);
            if (!description) {
                description = heading.text.slice(0, 200); // Limit to 200 characters
                console.log('Fallback to headings:', description);
            }
        }
    }

    // If no meta description is found, try the body text first for keywords
    const bodyText = root.querySelector('body')?.text || '';
    if (bodyText) {
        if (!description) {
            description = bodyText.slice(0, 200); // Limit to 200 characters
            console.log('Fallback to body text:', description);
        }
    }

    if(description) {
        addKeywordsFromString(description);
    }
    
    return {keywords: Array.from(keywords).slice(0, k), description};
};


// Function to fetch HTML with Playwright (for JavaScript-heavy pages)
const fetchHtmlWithPlaywright = async (url, retries = 3) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
        chromium.use(stealth);
        const browser = await chromium.launch({headless: true});
        const page = await browser.newPage();

        // Set custom headers
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
        });

        await page.goto(url, { waitUntil: 'domcontentloaded' }); // Wait for page load

        // Add another random delay of 1 to 5 seconds
        await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 4000 + 1000)));
        // Scroll the page to load additional content
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        // Add another random delay of 1 to 5 seconds
        await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 4000 + 1000)));
        
        const html = await page.content(); // Get HTML content of the page
        await browser.close();
        return html;
    } catch (error) {
        console.error(`Error navigating to URL with Playwright ${url}:`, error);

        // Check if it's a verification error and if there are retries left
        if (retries > 0) {
            console.log(`Waiting for 10 seconds before retrying...`);
            await sleep(10000); // 10-second wait
            return fetchHtmlWithPlaywright(url, retries - 1); // Retry fetching data
        }
    }
};

// Function to fetch HTML using Playwright or cloudscraper based on site
const fetchHtml = async (url) => {
    try {
        const html = await fetchHtmlWithPlaywright(url);
        if (html) {
            return html;
        }
    } catch (error) {
        console.error(`Error fetching HTML from ${url}:`, error);
    }
};

// Function to get the highest current pos value
const getNextPos = async () => {
    try {
        const [rows] = await connection.query('SELECT MAX(pos) AS maxPos FROM robotUrl');
        return rows[0].maxPos ? rows[0].maxPos + 1 : 1; // If no rows exist, start from 1
    } catch (error) {
        console.error('Error fetching max pos:', error);
    }
};

// Function to insert a new URL into the robotUrl table
const insertUrlWithPos = async (url) => {
    try {
        const nextPos = await getNextPos(); // Get the next pos value
        await connection.query('INSERT INTO robotUrl (url, pos) VALUES (?, ?) ON DUPLICATE KEY UPDATE url = url', [url, nextPos]); // Avoid duplication with 'ON DUPLICATE KEY'
        console.log(`Inserted URL: ${url} with pos: ${nextPos}`);
    } catch (error) {
        console.error(`Error inserting URL ${url}:`, error);
    }
};

// Function to update whether a url has been crawled to prevent it from being crawled multiple times
const updateCrawledStatus = async (url) => {
    try {
        const hostUrl = new URL(url).host;
        const [result] = await connection.execute(
            'UPDATE robotUrl SET crawled = "yes" WHERE url = ?',
            [hostUrl]
        );
        if (result.affectedRows > 0) {
            console.log(`URL ${hostUrl} marked as crawled.`);
        } else {
            console.log(`No matching URL found for ${hostUrl}.`);
        }
    } catch (err) {
        console.error('Error updating crawled status:', err);
    }
};


// Function to crawl URLs from the database
const crawlUrls = async () => {
    try {
        let continueCrawling = true;

        while (continueCrawling) {
            const [results] = await connection.query('SELECT * FROM robotUrl WHERE crawled = "no" ORDER BY pos');
            console.log(`Fetched ${results.length} URLs from robotUrl`);

            if (results.length === 0) {
                console.log('No URLs to crawl. Stopping the crawl process.');
                break; // Exit if there are no URLs to process
            }

            for (let row of results) {
                let nextUrl = row.url;
                if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://')) {
                    nextUrl = 'https://' + nextUrl; // Ensure the URL starts with a valid protocol
                }

                console.log(`Preparing to crawl URL: ${nextUrl}`);

                try {
                    console.log(`Crawling URL: ${nextUrl}`);
                    updateCrawledStatus(nextUrl);
                    const html = await fetchHtml(nextUrl); // Fetch HTML content
                    if (!html) {
                        console.log(`Skipping URL due to failed HTML fetch: ${nextUrl}`);
                        continue; // Skip if fetching fails
                    }

                    console.log(`Successfully crawled: ${nextUrl}`);
                    const root = parse(html);
                    const {keywords, description} = extractKeywordsAndDescription(root);

                    // Insert description into the database
                    await connection.query('INSERT INTO urlDescription (url, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description = ?', [nextUrl, description, description]);
                    console.log(`Inserted description for URL: ${nextUrl}`);

                    // Insert keywords into the database
                    for (const keyword of keywords) {
                        const escapedKeyword = keyword.replace(/[-\/\\^$.*+?()[\]{}|]/g, '\\$&'); // Escape any regex special characters
                        const rank = (html.match(new RegExp(escapedKeyword, 'gi')) || []).length; // Count occurrences
                        await connection.query('INSERT INTO urlKeyword (url, keyword, `rank`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `rank` = ?', [nextUrl, keyword, rank, rank]);
                        console.log(`Inserted keyword: ${keyword}, Rank: ${rank}`);
                    }

                    // Extract and insert new links into robotUrl
                    const links = root.querySelectorAll('a').map(link => link.getAttribute('href')).filter(href => href);
                    for (const link of links) {
                        try {
                            const absoluteUrl = new URL(link, nextUrl).href; // Resolve relative URLs
                            const host = new URL(absoluteUrl).host;

                            if (host) {
                                const [countResults] = await connection.query('SELECT COUNT(*) AS count FROM robotUrl WHERE url = ?', [host]);
                                if (countResults[0].count === 0) {
                                    await insertUrlWithPos(host); // Insert the new URL
                                    console.log(`Inserted new URL to crawl: ${host}`);
                                }
                            }
                        } catch (err) {
                            console.error(`Error processing link: ${link}`, err);
                        }
                    }

                    // Check if the number of entries in urlDescription is below the minimum threshold
                    const [count] = await connection.query('SELECT COUNT(*) AS count FROM urlDescription');
                    console.log(`Current urlDescription count: ${count[0].count}`);
                    if (count[0].count >= n) {
                        console.log('urlDescription has reached 500 entries. Stopping the crawl process.');
                        continueCrawling = false; // Stop crawling if the limit is reached
                        break; // Break out of the for loop
                    }

                } catch (err) {
                    console.error(`Error navigating to URL: ${nextUrl}`, err);
                }
            }
        }
    } catch (error) {
        console.error('Error fetching URLs:', error);
    }
};

// Express route to start crawling
router.get('/start', async (req, res) => {
    try {
        await crawlUrls();
        res.json({message: 'Crawling process finished.'});
    } catch (error) {
        console.error(error);
        res.status(500).json({error: 'Error starting crawling process'});
    }
});

module.exports = router;
