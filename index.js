const puppeteer = require('puppeteer');
const totp = require('totp-generator');
require('dotenv').config()
const chalk = require('chalk');
let argv = require('minimist')(process.argv.slice(2), {alias: {q: 'quiet'}, default: {headless: true}, boolean: ["headless"]});

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

// get user input interface for OTP
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

(async () => {

  async function check(username) {
    await page.click('[class*=searchBarComponent-]')
    await page.type('[class*=quickswitcher-] > input', '@'+username)
    await page.waitForSelector('[class^="contentDefault-"] > [class^="iconContainer-"]')
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

  const browser = await puppeteer.launch({headless: argv.headless, defaultViewport: {width: 1280, height: 720}});
  const page = await browser.newPage();
  await page.goto('https://discord.com/channels/@me', {waitUntil: 'networkidle0'});

  await page.type('[name="email"]', getLoginInfo('email'));
  await page.type('[name="password"]', getLoginInfo('password'));
  await page.click('[type="submit"]')

  // check if the login was successfull
  await new Promise(async resolve => {
    await page.waitForResponse(response => response.url().includes('https://discord.com/api/v8/auth/login'))
      .then(res => {
        if (res.ok()) {
          res.json().then(async json => {
            if (json.mfa) {
              if (process.env.totp) {
                await page.type('[class^=inputDefault]', totp(process.env.totp), {delay: 20})
                await page.click('[type="submit"]')
              } else {
                readline.question(warning('TOTP code needed. please enter it or disable it for this account\n'), async code => {
                  await page.type('[class^=inputDefault]', code)
                  await page.click('[type="submit"]')
                  readline.close();
                })
              }
              await page.waitForResponse(response => response.url().includes('https://discord.com/api/v8/auth/mfa/totp'))
                .then(res => {
                  if (res.ok()) { 
                    argv.quiet || console.log(chalk.green('successfully connected to discord'))
                    resolve()
                  } else {
                    res.json().then(json => {
                      console.log("the TOTP was wrong. try again\n", json)
                      process.exit(1)
                    })
                  }
                })
            } else if (json.sms) {
              console.log(error("SMS verification code detected. please open a issue on github as it's not supposed to happen. use TOTP instead"))
              process.exit(1)
            } else if (json.errors) {
              try {
                if (json.errors.login._errors[0].code === "ACCOUNT_LOGIN_VERIFICATION_EMAIL") {
                  console.log(error("check your emails, discord need email verification"))
                }
              } catch {
                console.log(error("couldn't connect\n", json.errors))
              }
              process.exit(1)
            } else {
              argv.quiet || console.log(chalk.green('successfully connected to discord'))
              resolve()
            }
          })
        } else {
          res.json().then(async json => {
            if (json.captcha_key) {
              console.log(error('a captcha is needed. please complete it manually. it should be the only time for this IP')); 

              const shownBrowser = await puppeteer.launch({headless: false, defaultViewport: null});
              const shownPage = await shownBrowser.newPage();
              await shownPage.goto('https://discord.com/channels/@me');

              await shownPage.type('[name="email"]', getLoginInfo('email'));
              await shownPage.type('[name="password"]', getLoginInfo('password'));
              await shownPage.click('[type="submit"]')
              await shownPage.evaluate(() => {
                alert("please complete the captcha and any extra step if needed to login to discord.")
              })
              await shownPage.waitForSelector('[class^=searchBarComponent-]', {timeout: 120000})
                .catch (e => {
                  console.log(typeof e)
                  if (e.includes("TimeoutError")) {
                    console.log(error("2min timeout expired, try again\n"))
                  } else {
                    console.log(error(e))
                  }
                  process.exit(1)
                })
              await shownBrowser.close()
              await page.reload()
              await page.type('[name="email"]', getLoginInfo('email'));
              await page.type('[name="password"]', getLoginInfo('password'));
              await page.click('[type="submit"]')
              resolve()
            } else {
              console.log(warning("error email :", json.errors.login._errors[0].code, json.errors.login._errors[0].message))
              console.log(warning("error password :", json.errors.password._errors[0].code, json.errors.password._errors[0].message))
              process.exit(1)
            }
          })
        }
      })
  })
  await page.waitForSelector('[class^=searchBarComponent-]')

  // my ugly baby to remediate the lack of page.waitForNetwork() https://github.com/puppeteer/puppeteer/issues/5328
  async function waitForNetwork(duration) {
    let epochLastResponse = Math.floor(new Date() / 1000)
    page.on("response", res => {
      epochLastResponse = Math.floor(new Date() / 1000)
    })
    await new Promise(async resolve => {
      let checkResponseInterval = await setInterval(() => {
        if(Math.floor(new Date() / 1000) - 2 >= epochLastResponse) {
          clearInterval(checkResponseInterval)
          resolve()
        }
      }, 1000)
    })
  }

  for (username of usernames) {
    let status = await check(username)
    if (argv.quiet) {
      console.log(username, status)
    } else {
      const responses = {
        online: chalk.green("online"),
        offline: chalk.gray("offline"),
        idle: chalk.keyword("orange")("idle"),
        dnd: chalk.red("do not disturb")
      }
      console.log(chalk.bold(`${username} : ${responses[status] || chalk.green(status)}`))
    }
  }
  await browser.close();
  process.exit(0) // i don't know why node doesn't exit by itself after the browser.close(), and there is no more puppeteer process
})()
