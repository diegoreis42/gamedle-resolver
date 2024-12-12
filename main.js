const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
    try {
        const browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        let isDataFetched = false;

        const saveFilePath = path.join(__dirname, 'shuffled_order.json');
        let existingShuffledOrder = null;

        // Ensure the JSON file exists or initialize with an empty array
        if (!fs.existsSync(saveFilePath)) {
            console.log('JSON file does not exist. Creating a new one.');
            fs.writeFileSync(saveFilePath, JSON.stringify([], null, 2));
        }

        try {
            existingShuffledOrder = JSON.parse(fs.readFileSync(saveFilePath, 'utf8'));
        } catch (readError) {
            console.error('Error reading the shuffled order file. Initializing with an empty array.', readError);
            existingShuffledOrder = [];
        }

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

                    fs.writeFileSync(saveFilePath, JSON.stringify(shuffledOrderData, null, 2));
                    console.log('Shuffled Order Updated');
                    existingShuffledOrder = shuffledOrderData;
                    isDataFetched = true;

                    await runScript();
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

        const runScript = async () => {
            const ids = JSON.parse(fs.readFileSync(saveFilePath, 'utf8'));

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

                // Type game name with delays
                await page.focus('#searchBox');
                await page.keyboard.type('                            ' + game.label, { delay: 50 });

                // Select and confirm the game
                await page.keyboard.press('ArrowDown');
                await page.keyboard.press('Enter');
                await page.keyboard.press('Enter');

                // Wait for the page to load after clicking next
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
