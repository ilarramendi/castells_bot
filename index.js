import puppeteer from 'puppeteer';
import {writeFileSync} from 'fs';


const browser = await puppeteer.launch();
const page = await browser.newPage()

const BASE_URL = 'https://subastascastells.com/'
const URL_REMATE = BASE_URL + 'frontend.sitio.visualremate.aspx?Remate=';
const USERNAME = 'ilarramendi1@gmail.com'
const PASSWORD = 'Po&E@*av87qqofCgzUNZ$Wwi'

var tracking = []

async function start() {
    var auctions = await getActiveAuctions('https://subastascastells.com/frontend.sitio.visualremate.aspx?Remate=635');
    auctions.slice(0, 100).forEach(auction => track(auction.link, auction.id, auction.initial_price))

    await startTracking()
}

await start();
await browser.close();

function logActiveAuctionsResults(results) {
    console.table(results.map(l => Object.values(l).map(c => typeof c === 'string' ? c.substring(0, 75) : c)));
}

async function getActiveAuctions(url) {
    await page.goto(url);
    await page.waitForTimeout(5000)
    var subastas = await page.$$('#row-in-process-lotes > div');
    return Promise.all(subastas.map(async s => {
        return {
            title: await s.$eval(".card-title", e => e.textContent),
            description: await s.$eval(".card-description", e => e.textContent.trim()),
            close_time: await s.$eval(".card-ending-date > span:last-child", e => e.textContent),
            initial_price: await s.$eval("[class='card-subdescription'] > span:last-child", e => parseInt(e.textContent.split(" ")[1])),
            price: await s.$eval('.value-current-offert', e => parseInt(e.textContent)),
            currency: await s.$eval(".card-current-offert > span:nth-child(2)", e => e.textContent),
            id: await s.$eval("div", e => parseInt(e.getAttribute('data-id'))),
            link: BASE_URL + await s.$eval("a", e => e.getAttribute('href')),
            img: await s.$eval("img", e => e.getAttribute('src'))
        }
    } ));


}``

async function getActiveCategories() {
    await page.goto('https://subastascastells.com/frontend.home.aspx');
    var subastas = await page.$$('#SubastasenprogresofsContainerDiv [id^="SubastasenprogresofsContainerRow_"]');
    subastas = subastas.map(async s => {
        return {
            name:  await s.$eval('[id^="span_SUBASTASENPROGRESO__REMATENOMBRE_"]', e => e.textContent),
            link: URL_REMATE + await s.$eval("a.gx-image-link", e => e.getAttribute("href").split('=')[1])
        }
    })
    return Promise.all(subastas)


}

async function login(user, passwd) {
    await page.goto('https://subastascastells.com/frontend.login.aspx');
    await page.type('#vUSERNAME', user)
    await page.type('#vUSERPASSWORD', passwd)
    await page.click('#BTNENTER')
}

function track(link, id, initialPrice) {
    tracking.push({
        id,
        link,
        priceHistory: [{
            price: initialPrice,
            date: new Date()
        }]
    })
    writeFileSync('./tracking.json', JSON.stringify(tracking, null, 2))
}

async function startTracking() {
    while (true) {
        await performTracking();
        await new Promise(r => setTimeout(r, 120 * 1000));
    }
}

async function performTracking()  {
    var i = 1
    console.log('Starting tracking for', tracking.length, 'items')
    for (const tr of tracking) {
        await page.goto(tr.link);
        const price = parseInt(await page.$eval('#TBVALOROFERTAACTUAL', e => e.textContent.split(' ')[1]))
        if (!tr.priceHistory.includes(ph => ph.price === price)) {
            tr.priceHistory.push({
                price,
                date: new Date()
            })
        }
        i++;
    }
    writeFileSync('./tracking.json', JSON.stringify(tracking, null, 2))
    console.log('Done!')
}
