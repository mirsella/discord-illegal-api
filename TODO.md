server.js endpoint to get a screenshot of a conversation, to see the answers of a message.
/conversation {"username#1234": 3600}
take screenshot, upload it to https://api.imgbb.com/ with a expiration (default to maybe 24H but it can be changed in the http requestin seconds)
and transfer the response from https://api.imgbb.com/ to the user
