'use strict';

const apprun = require('apprun').app;
require('./db');

const express = require('express');
const path = require('path');
const { createServer } = require('http');
const webSocket = require('ws');
const app = express();

app.use(express.static(path.join(__dirname, '../public')));

const server = createServer(app);
const wss = new webSocket.Server({ server });

wss.on('connection', function (ws, req) {
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  ip = ip.split(',')[0];
  ws.on('message', function (data) {
    try {
      const json = JSON.parse(data);
      json.ip = ip;
      console.log('==>', json);
      apprun.run(json.event, json, ws);
    } catch (e) {
      ws.send(e.toString());
      console.error(e);
    }
  });

  ws.on('close', function() {
    console.log('closing ws connection');
  });

  console.log('started ws connection');
});

const port = process.env.PORT;
const listener = server.listen(port, () => {
  console.log(`Your app is listening on port ${listener.address().port}`);
});