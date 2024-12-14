const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        let isDataFetched = false;

        const adHosts = ['googlesyndication.com', 'adservice.google.com', 'doubleclick.net'];

        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const url = request.url();
            if (adHosts.some(host => url.includes(host))) {
                console.log(`Blocking ad request: ${url}`);
                request.abort();
            } else {
                request.continue();
            }
        });

        page.on('response', async (response) => {
            try {
                if (response.url().includes('legendBoardLoad') && !isDataFetched) {
                    const json = await response.json();
                    const shuffledOrderData = json.legendBoardAC.shuffledorder;

                    isDataFetched = true;

                    await runScript(shuffledOrderData);
                }
            } catch (jsonError) {
                console.error('Error getting JSON:', jsonError);
            }
        });

        await page.goto('https://www.gamedle.wtf/unlimited#', {
            waitUntil: 'networkidle0'
        });

        await page.waitForSelector('#start_unlimited', { visible: true, timeout: 10000 });

        await page.evaluate(() => {
            const startButton = document.querySelector('#start_unlimited');
            if (startButton) {
                startButton.focus();
            }
        });
        await page.click('#start_unlimited');

        await page.waitForFunction(() => {
            const gamelistData = JSON.parse(localStorage.getItem('__gamelist__data'));
            return gamelistData && gamelistData.length > 0;
        }, { timeout: 10000 });

        const runScript = async (ids) => {

            const gamelistData = await page.evaluate(() => {
                return JSON.parse(localStorage.getItem('__gamelist__data'));
            });

            for (let id of ids) {
                const game = gamelistData.find(game => game.value === id);

                if (!game) {
                    console.error('Game not found');
                    await browser.close();
                    return;
                }

                console.log('Selected game:', game.label, "id: ", id);

                await page.focus('#searchBox');
                await page.keyboard.type('                            ' + game.label, { delay: 50 });

                await page.waitForSelector('.tt-suggestion', { timeout: 5000 });

                const suggestions = await page.$$eval('.tt-suggestion', (elements) => {
                    return elements.map(element => element.textContent.trim());
                });

                const suggestionIndex = suggestions.indexOf(game.label);

                if (suggestionIndex !== -1) {
                    await page.keyboard.press('ArrowDown', { delay: 100 });
                    console.log("Suggestion index: ", suggestionIndex);
                    for (let i = 0; i < suggestionIndex; i++) {
                        await page.keyboard.press('ArrowDown');
                        console.log("Arrow moved down");
                    }
                    await page.keyboard.press('Enter');
                    await page.keyboard.press('Enter');
                } else {
                    console.error('Suggestion not found for game:', game.label);
                }

                await page.waitForSelector('#next', { visible: true });
                await page.click('#next');
            }

            console.log('All games processed.');
            await browser.close();
        };
    } catch (error) {
        console.error('Overall script error:', error);
    }
})();