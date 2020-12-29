const puppeteer = require('puppeteer');
require('dotenv').config()
const chalk = require('chalk');

function getLoginInfo(info) { 
  if (eval(`process.env.${info}`)) {
    return eval(`process.env.${info}`)
  } else {
    console.log(error(`you didn't set your ${info} in the .env file !`))
    process.exit(1)
  }
}

// chalk settings
const error = chalk.redBright.bold;
const warning = chalk.keyword('orange');

// get the username(s) to check
let usernames = []
process.argv.slice(2).length != 0 && (process.argv.slice(2).forEach(username => usernames.push(username))) // usernames from shell arguments
process.env.usernames && (process.env.usernames.split(',').forEach(username => usernames.push(username))) // usernames from .env file
usernames = [... new Set(usernames)] // remove duplicates
// filter the [','] from ↑ and the username who don't match the regex.
usernames = usernames.filter(username => {
  if (username != ',' && username.match('.*#[0-9]{4}')) {
    return true
  } else if (username != ',' && !username.match('.*#[0-9]{4}')) {
    console.log(`${username} didn't match the regex .*#[0-9]{4} for discord username ! ${username} will not be checked !`)
    return false
  }
})
console.log(chalk.green('thoses usernames will be checked :', usernames));



(async () => {

  async function check(username) {
    await page.click('[class^=searchBarComponent-]')
    await page.type('[class*=quickswitcher-] > input', '@'+username, {delay: 20})
    if (await page.$('[class^="contentDefault-"] > [class^="iconContainer-"]') === null) {
      console.log(error("couldn't find the user "+username))
      console.log(warning(`please try to manually search @${username} in the discord find menu too verify`))
    }
    await page.click('[class^="contentDefault-"] > [class^="iconContainer-"]')
    let status = (await page.evaluate(() => {
      return document.querySelector('a[class*=selected-] > div > div > div > svg > rect').getAttribute('mask')
    }))
    return status.replace('url(#svg-mask-status-', '').replace(')', '')
  }

  const browser = await puppeteer.launch({headless: true, defaultViewport: {width: 1280, height: 720}});
  const page = await browser.newPage();
  await page.goto('https://discord.com/channels/@me');

  await page.type('[name="email"]', getLoginInfo('email'), {delay: 20});
  await page.type('[name="password"]', getLoginInfo('password'), {delay: 20});
  await page.click('[type="submit"]')

  // check if the login was successfull
  // TODO : add otp support
  await page.waitForResponse(response => response.url().includes('https://discord.com/api/v8/auth/login'))
    .then(res => {
      if (!res.ok()) {
        console.log(error("couldn't connect"))
        res.json().then(json => {
          console.log(warning("email :", json.errors.login._errors[0].code, json.errors.login._errors[0].message))
          console.log(warning("password :", json.errors.password._errors[0].code, json.errors.password._errors[0].message))
          process.exit(1)
        })
      }
    })

  // waiting for discord to load. if only this was implemented : https://github.com/puppeteer/puppeteer/issues/5328
  await page.waitForSelector('[class^=searchBarComponent-]', {waitUntil: 'networkidle0'})

  // console.log(await check('mirsella#1008'))
  for (username of usernames) {
    switch(await check(username)) {
      case "online":
        console.log(chalk.bold(`${username} : `) + chalk.green.bold("online"))
        break;
      case "offline":
        console.log(chalk.bold(`${username} : `) + chalk.gray.bold("offline"))
        break;
      case "idle":
        console.log(chalk.bold(`${username} : `) + chalk.keyword("orange").bold("idle"))
        break;
      case "dnd":
        console.log(chalk.bold(`${username} : `) + chalk.red.bold("do not disturb"))
        break;
      default:
        console.log(username, 'default')
    }
  }
  await browser.close();
})();
