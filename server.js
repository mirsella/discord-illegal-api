const puppeteer = require('puppeteer');
const helmet = require('helmet')
const FormData  = require('form-data');
const morgan = require('morgan')
const express = require('express');
const totp = require('totp-generator');
const { PendingXHR } = require('pending-xhr-puppeteer');
require('dotenv').config()
const chalk = require('chalk');
const axios = require('axios');
const argv = require('minimist')(process.argv.slice(2), {default: {headless: true, chromeSession: 'PrivateChromeSessions'}, boolean: ["headless"], string: ['chromeSession']});
const app = express();
app.use(morgan('common'))
app.use(express.json()); 
app.use(hemet())

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

// get user input interface for OTP
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

(async () => {

  let currentSelectedUsername = ""
  async function selectUsername(username) {
    if (currentSelectedUsername != username) {
      await page.click('[class*=searchBarComponent-]')
      await page.type('[class*=quickswitcher-] > input', '@'+username)
      await page.waitForSelector('[class^="content"] > [class^="iconContainer-"]')
        .catch(e => {
          console.log(error(`couldn't find @${username} please try to manually search in the discord find menu too verify`))
          console.log(e)
          process.exit(1)
        })
      await page.click('[class^="content"] > [class^="iconContainer-"]')
      currentSelectedUsername = username
    }
  }

  const browser = await puppeteer.launch({headless: argv.headless, defaultViewport: {width: 1280, height: 720}, userDataDir: argv.chromeSession});
  const page = await browser.newPage();
  await page.goto('https://discord.com/channels/@me', {waitUntil: 'networkidle0', timeout: 60000});

  if (await page.$('[class^=searchBarComponent-]') === null) { // discord isn't connected
    await page.type('[name="email"]', getLoginInfo('email'));
    await page.type('[name="password"]', getLoginInfo('password'));
    await page.click('[type="submit"]')

    // check if the login was successfull
    await new Promise(async resolve => {
      async function loginOK(page, json) {
        if (json.mfa) {
          if (process.env.totp) {
            await page.type('[class^=inputDefault]', totp(process.env.totp))
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
                console.log(chalk.green('successfully connected to discord'))
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
          console.log(chalk.green('successfully connected to discord'))
          resolve()
        }
      }
      await page.waitForResponse('https://discord.com/api/v8/auth/login')
        .then(res => {
          if (res.ok()) {
            res.json().then(async json => {
              loginOK(page, json)
            })
          } else {
            res.json().then(async json => {
              if (json.captcha_key) {
                console.log(error('a captcha is needed. please complete it manually. it should be the only time for this IP')); 

                const shownBrowser = await puppeteer.launch({headless: false, defaultViewport: null, userDataDir: argv.chromeSession});
                const shownPage = await shownBrowser.newPage();
                await shownPage.goto('https://discord.com/channels/@me', {waitUntil: 'networkidle0', timeout: 60000});

                await shownPage.type('[name="email"]', getLoginInfo('email'));
                await shownPage.type('[name="password"]', getLoginInfo('password'));
                await shownPage.click('[type="submit"]');
                await shownPage.evaluate(() => {
                  alert("please complete the captcha and any extra step if needed to login to discord.")
                });

                // TOTP after completing the captcha
                shownPage.waitForResponse('https://discord.com/api/v8/auth/login', {timeout: 0}) // this match the res error saying it need a captcha
                  .then(res => {
                    shownPage.waitForResponse('https://discord.com/api/v8/auth/login', {timeout: 0}) // this one match the res saying it need a TOTP
                      .then(res => res.json())
                      .then(json => loginOK(shownPage, json))
                  })

                console.log("waiting for searchBarComponent")
                await shownPage.waitForSelector('[class^=searchBarComponent-]', {timeout: 0})
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
  } else {
    console.log(chalk.green('successfully connected to discord'))
  }

  await page.waitForSelector('[class^=searchBarComponent-]', {timeout: 60000})
  const pendingXHR = new PendingXHR(page);
  await pendingXHR.waitForAllXhrFinished();

  let inUse = false
  app.get('/status', async (req, res) => {
    if (!inUse) {
      inUse = true
      let status = {}
      for (username of req.body) {
        if (username.match('.*#[0-9]{4}')) {
          await selectUsername(username)
          await page.click('h3[class*=title][role=button]')
          let statu = await page.$eval('div[class*=topSectionNormal-] > header > div[class*=avatar-] > svg[class*=mask-] > rect[class*=pointerEvent]', el => el.getAttribute('mask'))
          await page.mouse.click(0, 0)
          status[username] = await statu.replace('url(#svg-mask-status-', '').replace(')', '')
          await page.waitForTimeout(600)
        } else {
          status[username] = "invalid username. regex didn't match"
        }
      }
      console.log(status)
      res.send(status)
      inUse = false
    } else {
      res.statusMessage = "worker in use please retry later"
      res.sendStatus(429)
    }
  });

  app.post('/message', async (req, res) => {
    if (!inUse) {
      inUse = true
      let response = {}
      for (username in req.body) {
        if (username.match('.*#[0-9]{4}')) {
          await selectUsername(username)
          await page.type('[class*=slateTextArea]', req.body[username])
          await page.type('[class*=slateTextArea]', String.fromCharCode(13));
          // from what i've seen the id [0-9] is always 19 char long but we never know so a + work
          await page.waitForResponse(res => res.url().match('https://discord.com/api/v8/channels/[0-9]+/messages'))
        } else {
          response[username] = "invalid username. regex didn't match"
        }
      }
      res.send(response)
      inUse = false
    } else {
      res.statusMessage = "worker in use please retry later"
      res.sendStatus(429)
    }
  })

  app.get('/chat', async (req, res) => {
    if (!inUse) {
      inUse = true
      let response = {}
      for (username in req.body) {
        if (username.match('.*#[0-9]{4}')) {
          await selectUsername(username)
          await pendingXHR.waitForAllXhrFinished();
          let screenshot = await (await page.$('div[class*=chat-]')).screenshot({encoding: "base64"})
          let form = new FormData();
          form.append("image", screenshot)
          form.append("expiration", req.body[username] != 0 ? req.body[username] : 6*3600)
          await axios.post(`https://api.imgbb.com/1/upload?key=${process.env.imgbb_key}`, form, { headers: form.getHeaders() })
            .then(res => {
              response[username] = res.data
            })
            .catch(e => response[username] = e)
        } else {
          response[username] = "invalid username. regex didn't match"
        }
      }
      res.send(response)
      inUse = false
    } else {
      res.statusMessage = "worker in use please retry later"
      res.sendStatus(429)
    }
  })

  let PORT = process.env.PORT || argv.port || 8080
  app.listen(PORT, () => {
    console.log(chalk.green(`Listening at port :${PORT}`));
  });
})()
