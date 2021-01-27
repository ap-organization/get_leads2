const chalk = require('chalk')
const { GoogleSpreadsheet } = require('google-spreadsheet')
const params = require('./params.json')

/**
 * getDoc
 */
const getDoc = async () => {
  try {
    console.log(chalk.cyan('--- init gsheet'))
    const doc = new GoogleSpreadsheet(params.gsheet.id)
    await doc.useServiceAccountAuth({
      client_email: params.gsheet.client_email,
      private_key: params.gsheet.private_key
    })
    await doc.loadInfo()
    return doc
  } catch (e) {
    console.log(chalk.red('error:', e))
  }
}

/**
 * getSheet
 * @param {Object} doc
 * @param {String} sheetName
 */
const getSheet = async (doc, sheetName) => {
  try {
    let sheet = doc.sheetsByTitle[sheetName]
    return sheet
  } catch (e) {
    console.log(chalk.red('error:', e))
  }
}

module.exports = {
  getDoc,
  getSheet
}
