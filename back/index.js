'use strict'

/**
 * imports
 */
const chalk = require('chalk')
const fs = require('fs')
const params = require('./params.json')
const cookies = require('./cookies.json')
const { getDoc, getSheet } = require('./gsheet.js')
const {
  goOnUrl,
  scrollDownPage,
  waitForSeconds,
  getBrowser,
  getPage,
  closePuppeteer
} = require('./puppeteer.js')

/**
 * global variables
 */
const messages = {
  '!query': '!query: bad inputs, need [target_lead]',
  '!gsheet': '!gsheet: could not connect to google sheet',
  '!puppeteer': '!puppeteer: could not launch puppeteer',
  '?': '?'
}

const statusCodes = {
    '422 Unprocessable Entity': 422,
}

/**
 * @params (Object) req - request with query params
 * @params (Object) res - json response
 */
exports.peopleScrapper = async (req, res) => {
  /**
   * debug
   */
  // let DEBUG = false
  console.log(chalk.yellow('req.method:'), JSON.stringify(req.method))
  console.log(chalk.yellow('req.params:'), JSON.stringify(req.params))
  console.log(chalk.yellow('req.query: '), JSON.stringify(req.query))
  console.log(chalk.yellow('req.body:  '), JSON.stringify(req.body))

  /**
   * init gsheet
   */
  let doc
  let sheet
  let values = []
  try {
    doc = await getDoc()
    sheet = await getSheet(doc, 'inputs')
    await sheet.loadCells('G2:G2')
    const cell = sheet.getCell(1, 6)
    values.push(cell.value)
    console.log('values:', values)
  } catch (e) {
    console.log(chalk.red('error:', e))
    res.status(statusCodes['422 Unprocessable Entity']).send({ error: messages['!gsheet'] })
    return
  }

  // process.exit(0)

  /**
   * init puppeteer
   */
  let browser
  let page
  try {
    const isHeadless = false
    let args = [
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--no-first-run',
      '--no-zygote',
      '--proxy-bypass-list=*',
      '--deterministic-fetch'
    ]
    browser = await getBrowser(args, isHeadless)
    page = await getPage(browser)
  } catch (e) {
    console.log(chalk.red('error:', e))
    res.status(statusCodes['422 Unprocessable Entity']).send({ error: messages['!puppeteer'] })
    return
  }

  /**
   * try business logic
   * catch errors
   * finally end program properly
   */
  try {
    if (Object.keys(cookies).length) {
      await page.setCookie(...cookies)
    } else {
      // login
      await goOnUrl(page, params.linkedin.urls.login)
      await page.type('#username', params.linkedin.auth.premium.mail, { delay: 30 })
      await page.type('#password', params.linkedin.auth.premium.password, { delay: 30 })
      console.log(chalk.yellow('submit login form'))
      const [submit_button] = await page.$x(`//button[contains(., '${'S’identifier'}')]`)
      await page.evaluateHandle(el => el.click(), submit_button)
      console.log(chalk.yellow('waiting for page to load ...'))
      await waitForSeconds(10)
      let currentCookies = await page.cookies()
      fs.writeFileSync('./cookies.json', JSON.stringify(currentCookies))
    }

    // get the right gsheet
    sheet = await getSheet(doc, 'employees')
    // loop over companies
    const ids = values
    for (let i = 0; i < ids.length; i++) {
      // 1
      // await goOnUrl(page, params.linkedin.urls.company)
      // click on 'lire plus'
      // scrap presentation
      // scrap site web
      // scrap type
      // scrap fonded in
      // scrap specialisations
      // click on 'Tous les employés' => no need
      // 2
      let seeEmployeesUrl = `https://www.linkedin.com/sales/search/people/list/employees-for-account/${ids[i]}?doFetchHeroCard=false&geoIncluded=105015875&logHistory=true&page=1`
      await goOnUrl(page, seeEmployeesUrl)
      await waitForSeconds(5)
      let nbPages = 1
      // get number of pages to click
      const pagination = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll('.search-results__pagination'),
            elem => elem.innerText
          )
      )
      let paginationTab = pagination[0]
      for (let j = 0; j <= paginationTab; j++) {
        if (!isNaN(parseInt(paginationTab[j])) && parseInt(paginationTab[j]) > nbPages) {
          nbPages = parseInt(paginationTab[j])
        }
      }
      console.log(chalk.yellow('nbPages:'), nbPages)
      //
      for (let j = 1; j <= nbPages; j++) {
        // scroll slowly (important)
        await scrollDownPage(page)
        // get all names: result-lockup__name4
        const names = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll('.result-lockup__name'),
            elem => elem.innerText
          )
        )
        // get all positions: result-lockup__highlight-keyword   
        const positions = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll('.result-lockup__highlight-keyword'),
            elem => elem.innerText
          )
        )
        // get all info: horizontal-person-entity-lockup-4   
        const infos = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll('.horizontal-person-entity-lockup-4'),
            elem => elem.innerText
          )
        )
        // make row to inject in gsheet
        if (names.length != positions.length || names.length != infos.length) {
          console.log(chalk.red('names.length != positions.length'))
          console.log(chalk.red('names.length', names.length))
          console.log(chalk.red('positions.length', positions.length))
          console.log(chalk.red('infos.length', infos.length))
          process.exit(0)
        }
        const employees = []
        for (let k = 0; k < names.length; k++) {
          try {
            let anteriority = 'na'
            const tab = infos[k].split('\n')
            for (let l = 0; l < tab.length; l++) {
              if (tab[l].includes('à ce poste dans l')) {
                anteriority = tab[l]
              }
            }
            let employee = {
              company_id: ids[i],
              name: names[k],
              position: positions[k].split('\n')[0],
              anteriority: anteriority
            }
            // await sheet.addRow(pub);
            employees.push(employee)
            console.table(employee)
          } catch (err) {
            console.log('error:', err)
          } finally {
            // console.table(employee)
          }
        }
        await sheet.addRows(employees)
        // go next page
        await page.waitForSelector('button[aria-label="Accéder à la page 2"]')
        await page.click('button[aria-label="Accéder à la page 2"]')
        // document.querySelectorAll('.link-without-visited-statekeyword')
        // const [submit_button] = await page.$x(`//button[contains(., '${'S’identifier'}')]`)
        // await page.evaluateHandle(el => el.click(), submit_button)
      }
    }
  } catch (e) {
    console.log(chalk.red('error:', e))
    res.status(statusCodes['422 Unprocessable Entity']).send({ error: messages['?'] })
  } finally {
    await closePuppeteer(browser, page)
    res.status(200).send({ ok: 'ok' })
  }
}
