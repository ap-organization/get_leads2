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
    '200 OK': 200
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
  let inputsSheet
  let employeesSheet
  // let values = []
  let idsToParse = []
  let lastParsedPageForId = []
  let id_row_offset = -1
  try {
    doc = await getDoc()
    inputsSheet = await getSheet(doc, 'inputs')
    await inputsSheet.loadCells('G2:I258')
    // ----
    // const cell = inputsSheet.getCell(1, 6)
    // values.push(cell.value)
    // console.log('values:', values)
    // ----
    const rows = await inputsSheet.getRows()
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].linkedin_sales_id != 'na' && rows[i].has_been_scrapped == 'no') {
        if (id_row_offset == -1) { // pour l'update de l'inputsSheet == premier id à ne pas avoir été scrappé
          id_row_offset = i
        }
        idsToParse.push(rows[i].linkedin_sales_id)
        if (rows[i].last_parsed_page == 'na') {
          lastParsedPageForId.push(0)
        } else {
          lastParsedPageForId.push(parseInt(rows[i].last_parsed_page))
        }
      }
    }
    console.log('idsToParse.length          ', idsToParse.length)
    console.log('lastParsedPageForId.length ', lastParsedPageForId.length)
    if (idsToParse.length > 0) {
      console.log('starting with              ', idsToParse[0])
      console.log('on page                    ', lastParsedPageForId[0] + 1)      
    }
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
    employeesSheet = await getSheet(doc, 'employees')
    // loop over companies
    // values = [ 6336, 114925 ]
    for (let i = 0; i < idsToParse.length; i++) {
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
      let seeEmployeesUrl = `https://www.linkedin.com/sales/search/people/list/employees-for-account/${idsToParse[i]}?doFetchHeroCard=false&geoIncluded=105015875&logHistory=true&page=1`
      await goOnUrl(page, seeEmployeesUrl)
      await waitForSeconds(5)
      await scrollDownPage(page)
      // get number of pages to click
      let nbPages = 1
      const pagination = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll('.search-results__pagination'),
          elem => elem.innerText
        )
      )
      let paginationTab
      try {
        paginationTab = pagination[0].split('\n')
      } catch (err) {
        console.log('no employee')
        continue
      }
      for (let j = 0; j < paginationTab.length; j++) {
        // console.log('paginationTab j =', j, paginationTab[j])
        let potentialNumber = parseInt(paginationTab[j].replace(/[^0-9a-z-A-Z ]/g, '').replace(/ +/, ' '))
        if (!isNaN(potentialNumber) && potentialNumber > nbPages) {
          nbPages = potentialNumber
        }
      }
      console.log(chalk.yellow('nbPages:'), nbPages)
      // loop over pages
      for (let j = (lastParsedPageForId[i] + 1); j <= nbPages; j++) {

        // check if page already parsed
        if (j > 1 && j == (lastParsedPageForId[i] + 1)) {
          console.log('company has already been parsed up to ', j - 1)
          let submit_button = await page.$x(`//button[@aria-label="Accéder à la page ${j}"]`)
          await page.evaluateHandle(el => el.click(), submit_button[0])
          console.log(chalk.yellow('going straight on page number'), j)
          await waitForSeconds(2)
          // scroll slowly (important)
          await scrollDownPage(page)
        }

        /**
         * get all names: result-lockup__name4
         */
        const names = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll('.result-lockup__name'),
            elem => elem.innerText
          )
        )
        /**
         * get all positions: result-lockup__highlight-keyword
         */
        const positions = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll('.result-lockup__highlight-keyword'),
            elem => elem.innerText
          )
        )
        /**
         * get all info: horizontal-person-entity-lockup-4
         */
        const infos = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll('.horizontal-person-entity-lockup-4'),
            elem => elem.innerText
          )
        )
        const infosHTML = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll('.horizontal-person-entity-lockup-4'),
            elem => elem.innerHTML
          )
        )
        // check parsing errors
        if (names.length != positions.length || names.length != infos.length) {
          console.log(chalk.red('names.length != positions.length'))
          console.log(chalk.red('names.length', names.length))
          console.log(chalk.red('positions.length', positions.length))
          console.log(chalk.red('infos.length', infos.length))
          // process.exit(0)
        }
        // make rows to inject in gsheet
        const employees = []
        let employee_position_offset = 0
        for (let k = 0; k < names.length; k++) {
          try {
            let employee_name = 'na'
            let employee_position = 'na'
            let anteriority = 'na'
            const tab = infos[k].split('\n')
            for (let l = 0; l < tab.length; l++) {
              if (tab[l].includes(names[k])) {
                employee_name = names[k]
              }
              if (tab[l].includes('à ce poste dans l')) {
                anteriority = tab[l]
              }
            }
            if (infosHTML[k].indexOf('<dd class="result-lockup__highlight-keyword') == -1) {
              console.log('employee_position_offset += 1')
              employee_position_offset += 1
            } else {
              employee_position = positions[k - employee_position_offset].split('\n')[0]
            }
            let employee = {
              company_id: idsToParse[i],
              pagination: j,
              name: employee_name,
              position: employee_position,
              anteriority: anteriority
            }
            employees.push(employee)
            // console.table(employee)
          } catch (err) {
            console.log('error:', err)
          } finally {
            // console.table(employee)
          }
        }
        await employeesSheet.addRows(employees)
        // go on next page
        if (j + 1 <= nbPages) {
          let nextIsNa = true
          let next_linkedin_sales_id
          while (nextIsNa) {
            next_linkedin_sales_id = inputsSheet.getCell(1 + id_row_offset + i, 6)
            if (next_linkedin_sales_id.value == 'na') {
              id_row_offset += 1
            } else {
              nextIsNa = false
              // break
            }
          }
          console.log('id_row_offset =', id_row_offset)
          let lastParsedPage = inputsSheet.getCell(1 + id_row_offset + i, 6 + 2)
          lastParsedPage.value = j
          await inputsSheet.saveUpdatedCells()
          let submit_button = await page.$x(`//button[@aria-label="Accéder à la page ${j + 1}"]`)
          await page.evaluateHandle(el => el.click(), submit_button[0])
          console.log(chalk.yellow('going on next page number'), (j + 1))
          await waitForSeconds(2)
          // scroll slowly (important)
          await scrollDownPage(page)
        } else {
          // go back to employees sheet
          let nextIsNa = true
          let next_linkedin_sales_id
          while (nextIsNa) {
            next_linkedin_sales_id = inputsSheet.getCell(1 + id_row_offset + i, 6)
            if (next_linkedin_sales_id.value == 'na') {
              id_row_offset += 1
            } else {
              nextIsNa = false
              // break
            }
          }
          console.log('id_row_offset =', id_row_offset)
          let hasBeenScrapped = inputsSheet.getCell(1 + id_row_offset + i, 6 + 1)
          hasBeenScrapped.value = 'yes'
          // await rows[1 + i].save()
          await inputsSheet.saveUpdatedCells()
          
        }
      }
    }
  } catch (e) {
    console.log(chalk.red('error:', e))
    res.status(statusCodes['422 Unprocessable Entity']).send({ error: messages['?'] })
  } finally {
    await closePuppeteer(browser, page)
    res.status(statusCodes['200 OK']).send({ ok: 'ok' })
  }
}
