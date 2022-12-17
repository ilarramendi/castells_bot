import puppeteer from 'puppeteer';
import {writeFileSync, readFileSync} from 'fs';
import commandLineArgs from 'command-line-args';
import prompt from 'prompt-sync'
const readLine = prompt({});


const browser = await puppeteer.launch();
const page = await browser.newPage()

const BASE_URL = 'https://subastascastells.com/'
const URL_REMATE = BASE_URL + 'frontend.sitio.visualremate.aspx?Remate=';
const LOGIN_URL = 'https://subastascastells.com/frontend.login.aspx';
const HOME_URL = 'https://subastascastells.com/frontend.home.aspx'

const offerInterval = 100

const USERNAME = ''
const PASSWORD = ''
const INTERVAL = 120 * 1000


var tracking = []

try {
    tracking = JSON.parse(readFileSync('./tracking.json').toString())
} catch (e) {
    console.log('Error reading tracking file.')
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getActiveAuctions(url) {
    await page.goto(url);
    await sleep(5000)
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


}

async function getActiveCategories() {
    await page.goto(HOME_URL);
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
    await page.goto(LOGIN_URL);
    await page.type('#vUSERNAME', user)
    await page.type('#vUSERPASSWORD', passwd)
    await page.click('#BTNENTER')
    await sleep(5000)
    if (page.url() === LOGIN_URL) {
        throw 'Login error, invalid username or password: ' + user + ' + ' + passwd
    }
}

function addAuction(auction, max) {
    tracking.push({
        ...auction,
        max: max,
        priceHistory: [{
            price: auction.price > auction.initial_price ? auction.price : auction.initial_price,
            date: new Date()
        }]
    })
    writeFileSync('./tracking.json', JSON.stringify(tracking, null, 2))
}

async function startTracking(user, passwd) {
    await login(user, passwd);
    while (true) {
        await performTracking();
        await new Promise(r => setTimeout(r, INTERVAL));
    }
}

async function performTracking()  {
    var i = 1
    console.log('Starting tracking for', tracking.length, 'items')
    for (const tr of tracking) {
        var lastPrice = tr.price
        if (lastPrice < tr.max) {
            await page.goto(tr.link);
            tr.price =  parseInt(await page.$eval('#TBVALOROFERTAACTUAL', e => e.textContent.split(' ')[1]))
            tr.best = !!await page.$('.BtnMejorPostor');
            if (!tr.best && (tr.price + offerInterval) < tr.max) {
                await page.click('.BtnLarge')
                await sleep(3000)
                tr.best = !!await page.$('.BtnMejorPostor');
                var newPrice =  parseInt(await page.$eval('#TBVALOROFERTAACTUAL', e => e.textContent.split(' ')[1]))
                console.log('Nueva oferta realizada para:', tr.description, `(ultimo: ${tr.price}, ofertado: ${newPrice})`)
                tr.price = newPrice;
            }
            if (tr.price !== lastPrice) {
                tr.priceHistory.push({
                    price: tr.price,
                    date: new Date(),
                    best: tr.best
                })
            }
        } else console.log('Precio maximo alcanzado, ignorando:', tr.description, `(max: ${tr.max}, ultimo: ${lastPrice})`)
        i++;
    }
    writeFileSync('./tracking.json', JSON.stringify(tracking, null, 2))
    console.log('Done!', new Date())
}

async function select(options, message, multi) {
    const inquirer = (await import('inquirer')).default; // it's an es module so this is the only way to import
    const {result}  = await inquirer.prompt([
        {
            type: multi ? 'checkbox' : 'list',
            name: 'result',
            message: message,
            default: options[0],
            choices: options
        }
    ])
    return multi ? result.map(r => options.indexOf(r)) : options.indexOf(result)
}

const optionDefinitions = [
    { name: 'find', alias: 'f' },
    { name: 'track', alias: 't', type: String, multiple: true, defaultOption: true },
    { name: 'start', alias: 's', type: Boolean },
    { name: 'username', alias: 'u', type: String },
    { name: 'password', alias: 'p', type: String },
]

const options = commandLineArgs(optionDefinitions)

if (options.start) await startTracking(options.username, options.password);
else if (options.find ?? true) {
    var categories = await getActiveCategories();
    var category = categories[await select(categories.map(c => c.name), 'Selecciona una categoria.')];

    var auctions = await getActiveAuctions(category.link);
    var selectedAuctions = await select(auctions.map(c => c.description), 'Selecciona una o multiples subastas.', true);
    selectedAuctions = auctions.filter((a, i) => selectedAuctions.includes(i))
    selectedAuctions.forEach(a => {
        var price = a.price > a.initial_price ? a.price : a.initial_price
        var max = Number(readLine('Valor maximo para: ' + a.description + ' $' + price + ': '))
        if (max > price) addAuction(a, max)
        else console.log('El precio debe ser mayor al precio actual')
    })
}

await browser.close();
