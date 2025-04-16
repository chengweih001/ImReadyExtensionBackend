import app from 'apprun';

import todo from './todo';

const ws = new WebSocket(`wss://${location.host}`);
ws.onmessage = function (msg) {
  const {event, state} = JSON.parse(msg.data);
  console.log('[DEBUG]ws.onmessage:', msg);
  app.run(event, state);
}

app.on('//ws:', (event, state) => {
  const msg = { event, state };
  ws.send(JSON.stringify(msg));
});

todo.mount(document.body);
// ws.onopen = () => app.run('//ws:', '@get-all-todo');
ws.onopen = () => app.run('//ws:', '@get-all-activity');
