const puppeteer = require('puppeteer');
const fs = require('fs').promises;

async function waitForDeliveriesResponses(page, minResponses = 1, maxWaitMs = 30000) {
    const responses = [];
    const start = Date.now();

    function onResponse(res) {
        try {
            const url = res.url();
            if (url.includes('/v4/deliveries/get-deliveries') && res.status && res.status() === 200) {
                responses.push(res);
            }
        } catch (e) {
            // ignore
        }
    }

    page.on('response', onResponse);

    while ((Date.now() - start) < maxWaitMs) {
        if (responses.length >= minResponses) break;
        await new Promise(r => setTimeout(r, 300));
    }
    page.off('response', onResponse); 
    return responses;
}

async function bypassAndScrape(url) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new', 
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', 
                '--disable-gpu',
                '--no-zygote',
            ],
        });

        const page = await browser.newPage();
        
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36'
        );

        const minDeliveriesResponses = 1;
        const deliveriesWaitMs = 30000;
        let deliveriesUrls = [];
        
        const waitPromise = waitForDeliveriesResponses(page, minDeliveriesResponses, deliveriesWaitMs);

        const finalUrl = url.includes('#all_sellers') ? url : url + '#all_sellers';
        console.log(`[INFO] Loading: ${finalUrl}`);

        await page.goto(finalUrl, { waitUntil: 'load', timeout: 60000 });
        
        const deliveriesResponses = await waitPromise;

        if (deliveriesResponses.length > 0) {
            console.log(`[SUCCESS] Caught ${deliveriesResponses.length} get-deliveries response(s).`);
            deliveriesUrls = deliveriesResponses.map(res => res.request().url());
            
            // Опціонально: отримати JSON-дані з відповідей
            const deliveriesData = [];
            for (const res of deliveriesResponses) {
                try {
                    const json = await res.json();
                    deliveriesData.push(json);
                } catch (e) {
                    console.warn('[WARN] Could not parse response JSON');
                }
            }
            
            return { urls: deliveriesUrls, data: deliveriesData };
        } else {
            console.warn('[WARN] No get-deliveries responses caught within timeout.');
            return { urls: [], data: [] };
        }

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

// Головна функція
async function main() {
    const targetUrl = process.argv[2];
    
    if (!targetUrl) {
        console.error('Usage: node parser.js <URL>');
        process.exit(1);
    }

    console.log(`[INFO] Starting parse for: ${targetUrl}`);
    const result = await bypassAndScrape(targetUrl);
    
    // Зберігаємо результати у файл
    await fs.writeFile('results.json', JSON.stringify(result, null, 2));
    console.log('[INFO] Results saved to results.json');
    
    // Виводимо результат
    console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
