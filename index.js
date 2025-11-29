const puppeteer = require('puppeteer');

/**
 * Очікує появи N успішних відповідей на endpoint get-deliveries або до таймауту.
 * Повертає масив знайдених відповідей (об'єктів Response)
 */
async function waitForDeliveriesResponses(page, minResponses = 1, maxWaitMs = 30000) {
    const responses = [];
    const start = Date.now();

    function onResponse(res) {
        try {
            const url = res.url();
            // Фільтруємо лише успішні відповіді 200 на потрібний endpoint
            if (url.includes('/v4/deliveries/get-deliveries') && res.status() === 200) {
                responses.push(res);
            }
        } catch (e) {
            // ignore response handling errors
        }
    }

    // Реєструємо слухача
    page.on('response', onResponse);

    // Полінг: чекати доки responses.length >= minResponses або таймаут
    while ((Date.now() - start) < maxWaitMs) {
        if (responses.length >= minResponses) break;
        await new Promise(r => setTimeout(r, 300));
    }
    
    // Видаляємо слухача, щоб він не впливав на наступні дії
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
        // Використовуємо опції, які покращують стабільність у контейнеризованих середовищах (як GitHub Actions)
        browser = await puppeteer.launch({
            headless: 'new', // Новий headless режим для кращої продуктивності
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
        
        // 1. Починаємо моніторинг XHR до навігації
        const waitPromise = waitForDeliveriesResponses(page, minDeliveriesResponses, deliveriesWaitMs);

        const finalUrl = url.includes('#all_sellers') ? url : url + '#all_sellers';
        console.log(`[INFO] Loading: ${finalUrl}`);

        // Використовуємо 'load' для очікування повного завантаження сторінки
        await page.goto(finalUrl, { waitUntil: 'load', timeout: 60000 });
        
        // 2. Чекаємо результати моніторингу
        const deliveriesResponses = await waitPromise;

        if (deliveriesResponses.length > 0) {
            console.log(`[SUCCESS] Caught ${deliveriesResponses.length} get-deliveries response(s).`);
            // Отримуємо URL запиту
            deliveriesUrls = deliveriesResponses.map(res => res.request().url());
        } else {
            console.warn('[WARN] No get-deliveries responses caught within timeout.');
        }

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

/**
 * Точка входу: читає URL з командного рядка та виводить результат у JSON.
 */
async function main() {
    // URL очікується як другий аргумент (process.argv[2])
    const targetUrl = process.argv[2];

    if (!targetUrl) {
        // Якщо URL не надано, виводимо помилку
        console.error("ERROR: Please provide a URL as an argument.");
        console.log(JSON.stringify({ error: 'Потрібен параметр "url" (не передано через командний рядок).' }));
        process.exit(1);
        return;
    }

    const result = await bypassAndScrape(targetUrl);

    if (typeof result === 'object' && result !== null && result.error) {
        // Вивід помилки у JSON
        console.log(JSON.stringify(result));
        process.exit(1);
    }
    
    // Вивід успішного результату у JSON
    console.log(JSON.stringify({ urls: result }));
}

main();
