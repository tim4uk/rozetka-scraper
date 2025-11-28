
const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '5mb' }));

/**
 * Очікує появи N успішних відповідей на endpoint get-deliveries або до таймауту.
 * Повертає масив знайдених відповідей
 */

async function waitForDeliveriesResponses(page, minResponses = 1, maxWaitMs = 30000) {
    const responses = [];
    const start = Date.now();

    function onResponse(res) {
        try {
            const url = res.url();
            // Фільтруємо лише успішні відповіді 200 на потрібний endpoint
            if (url.includes('/v4/deliveries/get-deliveries') && res.status && res.status() === 200) {
                responses.push(res);
            }
        } catch (e) {
            // ignore
        }
    }

    page.on('response', onResponse);

    // Полінг: чекати доки responses.length >= minResponses або таймаут
    while ((Date.now() - start) < maxWaitMs) {
        if (responses.length >= minResponses) break;
        await new Promise(r => setTimeout(r, 300));
    }
    page.off('response', onResponse); 
    return responses;
}

/**
 * Основна функція обходу та скрейпу.
 * Повертає масив URL-адрес запитів /v4/deliveries/get-deliveries.
 */

async function bypassAndScrape(url) {
    let browser;
    try {
        browser = await puppeteer.launch({
            // Обов'язково вказуємо шлях до системного Chromium
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
            headless: 'new', 
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', 
                '--disable-gpu',
                '--no-zygote', // Додаткова опція для стабільності в контейнерах
            ],
        });

        const page = await browser.newPage();
        
        // setUserAgent залишаємо, це часто допомагає уникнути блокування
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36'
        );

        const minDeliveriesResponses = 1;
        const deliveriesWaitMs = 30000;
        let deliveriesUrls = [];
        
        // 1. Починаємо моніторинг XHR до навігації
        const waitPromise = waitForDeliveriesResponses(page, minDeliveriesResponses, deliveriesWaitMs);

        const finalUrl = url.includes('#all_sellers') ? url : url + '#all_sellers';
        console.log(`[INFO] Loading: ${finalUrl}`);

        // Використовуємо 'domcontentloaded' замість 'networkidle2' для прискорення
        await page.goto(finalUrl, { waitUntil: 'load', timeout: 60000 });
        
        // 2. Чекаємо результати моніторингу
        const deliveriesResponses = await waitPromise;

        if (deliveriesResponses.length > 0) {
            console.log(`[SUCCESS] Caught ${deliveriesResponses.length} get-deliveries response(s).`);
            deliveriesUrls = deliveriesResponses.map(res => res.request().url());
        } else {
            console.warn('[WARN] No get-deliveries responses caught within timeout.');
        }

        // Повертаємо масив URL-адрес
        return deliveriesUrls;

    } catch (error) {
        console.error('[ERROR] Puppeteer failure:', error && (error.stack || error.message));
        return { error: `ERROR: Critical Puppeteer failure. Details: ${error && (error.message || error)}` };
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                // ignore
            }
        }
    }
}

// POST endpoint (залишається без змін)
app.post('/', async (req, res) => {
    const targetUrl = req.body && req.body.url;
    
    if (!targetUrl) {
        return res.status(400).send({ error: 'Потрібен параметр "url".' });
    }

    const result = await bypassAndScrape(targetUrl);

    if (typeof result === 'object' && result !== null && result.error) {
        return res.status(500).send(result);
    }
    
    res.status(200).send({ urls: result });
});

app.listen(PORT, () => {
    console.log(`[INFO] Cloud Run Scraper Service listening on port ${PORT}`);
});
