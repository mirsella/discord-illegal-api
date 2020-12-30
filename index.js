const puppeteer = require('puppeteer');
const totp = require('totp-generator');
require('dotenv').config()
const chalk = require('chalk');
let argv = require('minimist')(process.argv.slice(2), {alias: {q: 'quiet'}});

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
argv._.length != 0 && (argv._.forEach(username => usernames.push(username))) // usernames from shell arguments
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
argv.quiet || console.log(chalk.green('thoses usernames will be checked :', usernames));

// get user input interface
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
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

  const browser = await puppeteer.launch({headless: false, defaultViewport: {width: 1280, height: 720}});
  const page = await browser.newPage();
  await page.goto('https://discord.com/channels/@me');

  await page.type('[name="email"]', getLoginInfo('email'), {delay: 20});
  await page.type('[name="password"]', getLoginInfo('password'), {delay: 20});
  await page.click('[type="submit"]')

  // check if the login was successfull
  await page.waitForResponse(response => response.url().includes('https://discord.com/api/v8/auth/login'))
    .then(res => {
      if (res.ok()) {
        res.json().then(async json => {
          if (json.mfa) {
            if (process.env.totp) {
              await page.type('[class^=inputDefault]', totp(process.env.totp), {delay: 20})
              await page.click('[type="submit"]')
              argv.quiet || await page.waitForResponse(response => response.url().includes('https://discord.com/api/v8/auth/mfa/totp'))
                .then(res => {
                  res.ok() && console.log(chalk.green('successfully connected to discord'))
                })
            } else {
              readline.question(warning('TOTP code needed. please enter it or disable it for this account\n'), async code => {
                await page.type('[class^=inputDefault]', code, {delay: 20})
                await page.click('[type="submit"]')
                argv.quiet || await page.waitForResponse(response => response.url().includes('https://discord.com/api/v8/auth/mfa/totp'))
                  .then(res => {
                    res.ok() && console.log(chalk.green('successfully connected to discord'))
                  })
                readline.close();
              })
            }
          } else if (json.sms) {
            console.log(warning("SMS verification code detected. please open a issue on github as it's not supposed to happen. use TOTP instead"))
          } else if (json.captcha_key) {
            // TODO : relaunch in headless: false and make the user complete the captcha
            console.log(error('a captcha is needed. support for it soon', json.captcha_key)) 
            process.exit(1)
          } else if (json.errors.login._errors[0].code === "ACCOUNT_LOGIN_VERIFICATION_EMAIL") {
            console.log(error("check your emails, discord need verification"))
            process.exit(1)
          } else {
            argv.quiet || console.log(chalk.green('successfully connected to discord'))
          }
        })
      } else {
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

  for (username of usernames) {
    let status = await check(username)
    if (argv.quiet) {
      console.log(status)
    } else {
      switch(status) {
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
  }
  // await browser.close();
})();
