// @ts-check
const app = require('apprun').app;
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs')
const dbFile = "db/todo.db";
const exists = fs.existsSync(dbFile);

function using(fn) {
  const db = new sqlite3.Database(dbFile);
  fn(db);
  db.close();
}

console.log('Using database: ', dbFile);

const db = new sqlite3.Database(dbFile);
db.serialize(() => {
  if (!exists) {
    // TODO: To add memberIds.
    db.run(`CREATE TABLE Activities (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL,
                ownerId     TEXT    NOT NULL,
                started     NUMERIC NOT NULL DEFAULT 0,
              );`);
    console.log("New table created!");

    db.run(`CREATE TABLE TODO (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT    NOT NULL,
                done        NUMERIC NOT NULL DEFAULT 0,
                ip          VARCHAR(15) NOT NULL,
                CONSTRAINT Todo_ck_done CHECK (done IN (0, 1))
              );`);
    console.log("New table created!");    
  }
});


app.on('@get-all-activities', (json, ws) => {
  using(db => {
    const sql = 'select * from activities';
    db.all(sql, function (err, rows) {
      json.state = rows || [];
      console.log('  >', json);
      ws.send(JSON.stringify(json));
    });
  });
});

app.on('@create-activity', (json, ws) => {
  using(db => {
    const sql = 'insert into activities (name, ownerId) values (?,?)';
    db.run(sql, json.state.title, json.state.done, json.ip, function () {
      json.state.id = this.lastID;
      json.state.ip = json.ip;
      console.log('  >', 'created', json);
      ws.send(JSON.stringify(json));
    });
  });
});


// References from original TODO list app.
app.on('@get-all-todo', (json, ws) => {
  using(db => {
    const sql = 'select * from todo';
    db.all(sql, function (err, rows) {
      json.state = rows || [];
      console.log('  >', json);
      ws.send(JSON.stringify(json));
    });
  });
});

app.on('@get-todo', (json, ws) => {
  using(db => {
    const sql = 'select * from todo where id=?';
    db.get(sql, json.state.id, function (err, row) {
      json.state = row;
      console.log('  >', json);
      ws.send(JSON.stringify(json));
    });
  });
});

app.on('@create-todo', (json, ws) => {
  using(db => {
    const sql = 'insert into todo (title, done, ip) values (?,?,?)';
    db.run(sql, json.state.title, json.state.done, json.ip, function () {
      json.state.id = this.lastID;
      json.state.ip = json.ip;
      console.log('  >', 'created', json);
      ws.send(JSON.stringify(json));
    });
  });
});

app.on('@update-todo', (json, ws) => {
  using(db => {
    const sql = 'update todo set title=?, done=?, ip=? where id=?';
    db.run(sql, json.state.title, json.state.done, json.ip, json.state.id, function () {
      json.state.ip = json.ip;
      console.log('  >', 'updated', json);
      ws.send(JSON.stringify(json));
    });
  });
});

app.on('@delete-todo', (json, ws) => {
  using(db => {
    const sql = 'delete from todo where id=?';
    db.run(sql, json.state.id, function () {
      console.log('  >', 'deleted', json);
      ws.send(JSON.stringify(json));
    });
  });
});

app.on('@delete-all-todo', (json, ws) => {
  using(db => {
    const sql = 'delete from todo';
    db.run(sql, function () {
      console.log('  >', 'deleted all', json);
      ws.send(JSON.stringify(json));
    });
  });
});
