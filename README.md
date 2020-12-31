## get your discord friends status !


![demonstration](http://url/to/img.png)

for example, you can create a service which lauch index.js every X time to check if some friends are connected. you can then even send them anywhere you want like on a front end or to [your phone](https://github.com/mirsella/telegram-notif.sh)

- you need to put and completes the information in `.env.example` to `.env`
- you can provide username to check in the .env file and by puttin them as command arguments : `node index.js 'user#1234' 'foo#7896'`. duplicates and invalid name are removed

command line options :
- -q --quiet : less verbose, just output `username : status`
- --headless false : don't use this for your regular command.
    show chrome instead of hiding it. just to see how it work.
