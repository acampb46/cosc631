const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const {chromium} = require('playwright'); // Use Playwright
const cloudscraper = require('cloudscraper'); // Use cloudscraper
const {solveCaptcha} = require('2captcha'); // Use for solving CAPTCHA
const {parse} = require('node-html-parser');

require('dotenv').config();
// Environment Variables
const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbName = process.env.DB_NAME;
const captchaApiKey = process.env.CAPTCHA_API_KEY;

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
        str.split(/\s+/)
            .filter(word => word.length >= 3)
            .forEach(word => keywords.add(word));
    };

    const metaKeywords = root.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
        addKeywordsFromString(metaKeywords.getAttribute('content'));
    }

    const metaDescription = root.querySelector('meta[name="description"]');
    if (metaDescription) {
        description = metaDescription.getAttribute('content').slice(0, 200);
    }

    if (!description) {
        const titleTag = root.querySelector('title');
        if (titleTag) {
            addKeywordsFromString(titleTag.text);
            description = titleTag.text.slice(0, 200);
        }
    }

    if (!description) {
        const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
        for (let heading of headings) {
            addKeywordsFromString(heading.text);
            if (!description) {
                description = heading.text.slice(0, 200);
            }
        }
    }

    if (!description) {
        const bodyText = root.querySelector('body')?.text || '';
        addKeywordsFromString(bodyText);
        description = bodyText.slice(0, 200);
    }

    return {keywords: Array.from(keywords).slice(0, k), description};
};

// Function to solve CAPTCHA using 2Captcha
const solveCaptchaWith2Captcha = async (captchaImage) => {
    try {
        const captchaId = await solveCaptcha(captchaApiKey, {
            method: 'post', body: captchaImage
        });

        const result = await waitForCaptchaSolution(captchaId);
        return result.text;
    } catch (error) {
        console.error('Error solving CAPTCHA:', error);
        throw error;
    }
};

// Wait for the CAPTCHA solution to be ready
const waitForCaptchaSolution = async (captchaId, pollingInterval = 5000) => {
    let result;

    while (true) {
        result = await checkCaptchaSolution(captchaId, captchaApiKey);
        if (result.status === 'ready') {
            return result;
        }
        await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }
};

// Function to check the CAPTCHA solution
const checkCaptchaSolution = async (captchaId, apiKey) => {
    try {
        const response = await axios.get(`https://2captcha.com/res.php`, {
            params: {
                key: apiKey, action: 'get', id: captchaId,
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error checking CAPTCHA solution:', error);
        return {status: 'error', request: captchaId};
    }
};

// Function to fetch HTML with Playwright (for JavaScript-heavy pages)
const fetchHtmlWithPlaywright = async (url) => {
    try {
        const browser = await chromium.launch({headless: true});
        const page = await browser.newPage();
        await page.goto(url, {waitUntil: 'networkidle'});

        await page.waitForSelector('body:not(.loading)', {timeout: 60000});

        const captchaElement = await page.$('#captcha');
        if (captchaElement) {
            const captchaImage = await captchaElement.screenshot();
            const captchaSolution = await solveCaptchaWith2Captcha(captchaImage);
            await page.fill('#captchaInput', captchaSolution);
            await page.click('#submit');
            await page.waitForNavigation();
        }

        const html = await page.content();
        await browser.close();
        return html;
    } catch (error) {
        console.error(`Error navigating to URL with Playwright ${url}:`, error);
        return null;
    }
};

// Function to fetch HTML with cloudscraper
const fetchHtmlWithCloudscraper = async (url) => {
    try {
        const response = await cloudscraper.get(url, {
            // Wait for the content to be fully loaded
            resolveWithFullResponse: true,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
        });

        // Check if the response contains valid content
        if (response.statusCode >= 200 && response.statusCode < 300) {
            return response; // Valid content
        } else {
            console.warn(`Cloudscraper response did not contain valid content for URL: ${url}`);
            return null; // Invalid content, return null
        }
    } catch (error) {
        console.error(`Error fetching URL with cloudscraper ${url}:`, error);
        return null; // Error, return null
    }
};

// Function to fetch HTML using Playwright or cloudscraper based on site
const fetchHtml = async (url) => {
    try {
        const html = await fetchHtmlWithCloudscraper(url); // Try with cloudscraper first
        if (html) {
            return html;
        }
        // If cloudscraper fails, fall back to Playwright
        return await fetchHtmlWithPlaywright(url);
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
        await connection.query('INSERT INTO robotUrl (url, pos) VALUES (?, ?)', [url, nextPos]);
        console.log(`Inserted URL: ${url} with pos: ${nextPos}`);
    } catch (error) {
        console.error(`Error inserting URL ${url}:`, error);
    }
};

// Function to crawl URLs from the database
const crawlUrls = async () => {
    try {
        const [results] = await connection.query('SELECT * FROM robotUrl ORDER BY pos');
        console.log(`Fetched ${results.length} URLs from robotUrl`);

        for (let row of results) {
            let nextUrl = row.url;
            if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://')) {
                nextUrl = 'https://' + nextUrl;
            }

            console.log(`Preparing to crawl URL: ${nextUrl}`);

            try {
                console.log(`Crawling URL: ${nextUrl}`);
                const html = await fetchHtml(nextUrl); // Fetch HTML content
                if (!html) {
                    continue; // Skip if fetching fails
                }

                const root = parse(html);
                const {keywords, description} = extractKeywordsAndDescription(root);

                // Insert description into the database
                await connection.query('INSERT INTO urlDescription (url, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description = ?', [nextUrl, description, description]);
                console.log(`Inserted description for URL: ${nextUrl}`);

                // Insert keywords into the database
                for (const keyword of keywords) {
                    const rank = (html.match(new RegExp(keyword, 'gi')) || []).length;
                    await connection.query('INSERT INTO urlKeyword (url, keyword, `rank`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `rank` = ?', [nextUrl, keyword, rank, rank]);
                    console.log(`Inserted keyword: ${keyword}, Rank: ${rank}`);
                }

                // Extract and insert new links into robotUrl
                const links = root.querySelectorAll('a').map(link => link.getAttribute('href')).filter(href => href);
                for (const link of links) {
                    const absoluteUrl = new URL(link, nextUrl).href;
                    const host = new URL(absoluteUrl).host;

                    const [countResults] = await connection.query('SELECT COUNT(*) AS count FROM robotUrl WHERE url = ?', [host]);
                    if (countResults[0].count === 0) {
                        await insertUrlWithPos(host);
                        console.log(`Inserted new URL to crawl: ${host}`);
                    }
                }

                // Check if the number of entries in urlDescription is below the minimum threshold
                const [count] = await connection.query('SELECT COUNT(*) AS count FROM urlDescription');
                if (count[0].count >= n) {
                    console.log('urlDescription has reached 500 entries.');
                    break;
                }
            } catch (err) {
                console.error(`Error navigating to URL: ${nextUrl}`, err);
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
