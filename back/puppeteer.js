const puppeteer = require('puppeteer')
const chalk = require('chalk')
// const params = require('../params.json')

/**
 * goOnUrl
 * @param {Object} page
 * @param {String} url
 */
const goOnUrl = async (page, url) => {
  console.log(chalk.cyan('--- goOnUrl'))
  console.log(chalk.yellow('go to:', url.substring(0, 40), '...'))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await waitForSeconds(1)
}

/**
 * scrollDownPage
 * used for: some websites load data as you navigate, and you may need
 * to reproduce a full “human” browsing to get the information you need.
 * @param {Object} page - the page to scroll down
 */
const scrollDownPage = async (page) => {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      try {
        let totalHeight = 0
        const distance = 20
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight
          window.scrollBy(0, distance)
          totalHeight += distance
          if (totalHeight >= scrollHeight) {
            clearInterval(timer)
            resolve()
          }
        }, 70)
      } catch (error) {
        reject(error)
      }
    })
  })
}

/**
 * waitForSeconds
 * used for: self explaining
 * @param {Integer} seconds - nb of seconds
 */
const waitForSeconds = seconds =>
  new Promise(resolve => setTimeout(resolve, seconds * 1000))

/**
 * getBrowser
 * @param {String Array} args
 * @param {Boolean} isHeadless
 */
const getBrowser = async (args, isHeadless) => {
  console.log(chalk.cyan('--- getBrowser'))
  let browser = await puppeteer.launch({
    headless: isHeadless,
    defaultViewport: null,
    args: args
  })
  return browser
}

/**
 * getPage
 * @param {Object} browser
 */
const getPage = async browser => {
  console.log(chalk.cyan('--- getPage'))
  let page = await browser.newPage()
  await page.setUserAgent(
    'Mozilla/5.0 (X11 Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36'
  )
  return page
}

/**
 * closePuppeteer
 * @param {Object} browser
 * @param {Object} page
 */
const closePuppeteer = async (browser, page) => {
  console.log(chalk.cyan('--- closing puppeteer'))
  await page.close()
  await browser.close()
}

module.exports = {
  goOnUrl,
  scrollDownPage,
  waitForSeconds,
  getBrowser,
  getPage,
  closePuppeteer
}
