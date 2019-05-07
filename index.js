'use strict';

const
  express = require('express'),
  bodyParser = require('body-parser'),
  request = require('request'),
  pimage = require('pureimage'),
  fs = require("fs"),
  PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN,
  SERVER_URL = 'https://timestamp-bot.herokuapp.com',
  sslRedirect = require('heroku-ssl-redirect'),
  app = express().use(bodyParser.json()); // creates express http server

  app.use(sslRedirect());
  app.use('/tmp', express.static('/tmp'));

var images = new Object();
pimage.registerFont('./clockfont.ttf','Clock');

// Sets server port and logs message on success
app.listen(process.env.PORT, () => console.log('webhook is listening'));

// Creates the endpoint for our webhook
app.post('/webhook', (req, res) => {
  let body = req.body;
  // Checks this is an event from a page subscription
  if (body.object === 'page') {
    // Iterates over each entry - there may be multiple if batched
    body.entry.forEach(function(entry) {
      // Gets the message. entry.messaging is an array, but
      // will only ever contain one message, so we get index 0
      let webhook_event = entry.messaging[0];
      let sender_psid = webhook_event.sender.id;
      // Check if the event is a message or postback and
      // pass the event to the appropriate handler function
      if (webhook_event.message) {
        handleMessage(sender_psid, webhook_event.message);
      } else if (webhook_event.postback) {
        handlePostback(sender_psid, webhook_event.postback);
      }
    });
    // Returns a '200 OK' response to all requests
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // Returns a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {
  let VERIFY_TOKEN = process.env.TOKEN;
  // Parse the query params
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
  // Checks if a token and mode is in the query string of the request
  if (mode && token) {
    // Checks the mode and token sent is correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      // Responds with the challenge token from the request
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);

    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  }
});

// Handles messages events
function handleMessage(sender_psid, received_message) {
  let response;
  var file = false;
  let msg_id = received_message.mid;
  let filename = `/tmp/${msg_id}.jpg`;
  // Check if the message contains text
  if (!images[sender_psid] && !received_message.attachments) {
    // Create the payload for a basic text message
    response = {
      'text': 'Welcome to Timestamp bot. This bot will '  +
              'add a caption to the bottom of a picture ' +
              'you send. Start by sending a pic!'
    }
  } else if (received_message.attachments) {
    if (received_message.attachments[0].type != 'image') {
      response = {
        'text': 'Image format not recognized!'
      }
    }
    else {
      let url = received_message.attachments[0].payload.url;
      request(url).pipe(fs.createWriteStream(filename))
      images[sender_psid] = msg_id;
      response = {
        'text': 'Send your caption now!'
      }
    }
  }
  else {
    let caption = received_message.text;
    response = {
      'attachment': {
        'type': 'image',
        'payload': {
          'url': SERVER_URL + filename,
          'is_reusable': true
        }
      }
    }
    addCaption(filename, caption);
    file = true;
  }
  // Sends the response message
  callSendAPI(sender_psid, response, file);
}

// Handles messaging_postbacks events
function handlePostback(sender_psid, received_postback) {

}

// Sends response messages via the Send API
function callSendAPI(sender_psid, response, file) {
  // Construct the message body
  let request_body = {
    'recipient': {
      'id': sender_psid
    },
    'message': response,
  }
  // Send the HTTP request to the Messenger Platform
  request({
    "uri": "https://graph.facebook.com/v2.6/me/messages",
    "qs": { "access_token": PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {
      if (file) {
        delete images[sender_psid];
        fs.unlink(`/tmp/${sender_psid}.jpg`, () => console.log(`/tmp/${sender_psid}.jpg deleted!`));
        console.log(res.body);
      }
    } else {
      console.error("Unable to send message:" + err);
    }
  });
}

function addCaption(filename, caption) {
  var fnt = pimage.registerFont('./clockfont.ttf','Clock');
  let FONT = 275;
  fnt.load(() => {
    pimage.decodeJPEGFromStream(fs.createReadStream(filename)).then((img) => {
      var ctx = img.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.font = `${FONT}pt 'Clock'`;
      ctx.fillText(caption, 80, img.height * 0.8);
      pimage.encodeJPEGToStream(img, fs.createWriteStream(filename)).then(() => {
        console.log(`${filename} modified!`);
      });
    });
  });
}