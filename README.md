# get your discord friends status !
## don't hesitate to open a issue for any question or improvement.


demonstration of onetime.js
![demonstration](demonstration.png)

you can check your friends online status and send them messages.
it mean you can also send message to yourself from a shell or anything that can do a http request. it mean you can get push notification to your phone through discord ! for example after a long lasting task.

onetime.js is a single run script.<br>
server.js keep chrome connected to discord, you can then send http request to it how much you want when you want.<br>
example a script wich send a http request on /status every 10min to check the status of your friends, and if the status change to online from last request, you can send them a message with /message.


## configuration

- <b>!!! KEEP PRIVATE PrivateChromeSessions DON'T SHARE IT !!!</b>
- this is probably against discord TOS so at your own risk and use a second account.
- you need to edit `.env.example` and change the necessary item and save it as `.env`
    note that if it's the first connecting to the account on a IP adresse it will ask for a captcha and a email verification. the script is supposed to take it into account, you just need to follow instructions

### command line options :
- `--headless false` : don't use this for your regular command.
    show chrome instead of hiding it. just to see how it work.
- `--chromeSession '/tmp/discordChromeSession'` : change the path of the chrome session instead of the default `PrivateChromeSessions`

    onetime.js : 
  - `-q --quiet` : less verbose, just output `username : status`
      you can provide username to check in the .env file and by puttin them as command arguments : `node index.js 'user#1234' 'foo#7896'`. duplicates and non-discord valid names are removed

      sever.js :
  - `--port` : set the port to use. you can also use PORT in .env

### server.js
it bring up a express web server with 3 endpoints.

<b>/status</b> : GET request with a json list of usernames :<br>
`["user#1234", "foo#7896"]`<br>
and return : `{"user#1234": "online", "foo#7896": "dnd"}`<br>

<b>/message</b> : POST request with a json body of `username: message` :<br>
`{"user#1234": "hello from nodejs", "foo#7896": "hey, call me when you can"}`<br>
and return `{}` if it problaly worked, as if it didn't work the server crash and it return nothing haha.<br>

<b>/chat</b> : GET request with a json body of `username: expirationTimeInSec` :<br>
`{"user#1234": 0, "foo#7896": "3600"}`<br>
0 is the default which is 6 hours.
and return https://api.imgbb.com/#api-response <br>


if a username is incorrect it will return `{"invalidusername": "invalid username. regex didn't match"}` btw the regex is `.*#[0-9]{4}`
