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
  console.log('[DEBUG]serialize. exists:', exists);
  if (!exists) {
    // TODO: To add memberIds.
    db.run(`CREATE TABLE Activities (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL,
                ownerId     TEXT    NOT NULL
              );`);
    db.run(`CREATE TABLE ActivityMembers (
                activityId INTEGER NOT NULL,
                memberId TEXT NOT NULL,
                PRIMARY KEY (activityId, memberId),
                FOREIGN KEY (activityId) REFERENCES Activities(id)
              );`);    
    console.log("Activities table created!");

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


app.on('@get-all-activity', (json, ws) => {
  using(db => {
    const sql = 'select * from Activities';
    db.all(sql, function (err, rows) {
      console.log('[DEBUG]Activities table\n', rows);            
      json.state = rows || [];
      console.log('[DEBUG]', err);         
      console.log('  >', json);
      ws.send(JSON.stringify(json));
    });
    
    // TODO: debugging purpose
    const activityMembersSql = 'select * from ActivityMembers';
    db.all(activityMembersSql, function (err, rows) {
      // json.state = rows || [];
      console.log('[DEBUG]ActivityMembers table\n', rows);      
      // console.log('  >', json);
      // ws.send(JSON.stringify(json));
    });    
  });
});

app.on('@create-activity', (json, ws) => {
  using(db => {
    const activitySql = 'insert into Activities (name, ownerId) values (?,?)';
    db.run(activitySql, json.state.name, json.state.userId, function (e) {
      console.log('[DEBUG]', e);
      json.state.activityId = this.lastID;
      console.log('  >', 'created activity', json);

      // Now, insert the creator into the ActivityMembers table
      const memberSql = 'insert into ActivityMembers (activityId, memberId) values (?,?)';
      db.run(memberSql, this.lastID, json.state.userId, function (memberError) {
        console.log('[DEBUG]', memberError);
        if (memberError) {
          console.error('Error adding creator to ActivityMembers:', memberError);
          // You might want to handle this error, perhaps by rolling back the Activities insertion
          // or sending an error message to the client.
        } else {
          console.log('  >', 'added creator to ActivityMembers', { activityId: this.lastID, userId: json.state.userId });
        }
        ws.send(JSON.stringify(json)); // Send the response back to the client after both insertions
      });
    });
  });
});

app.on('@join-activity', (json, ws) => {
  using(db => {
    const sql = 'insert into ActivityMembers (activityId, memberId) values (?,?)';
    db.run(sql, json.state.activityId, json.state.userId, function () {
      json.state.ip = json.ip;
      console.log('  >', 'joined', json);
      ws.send(JSON.stringify(json));
    });
  });
});

app.on('@delete-all-activity', (json, ws) => {
  using(db => {
    const deleteActivitiesSql = 'delete from Activities';
    db.run(deleteActivitiesSql, function (err) {
      console.log('[DEBUG]deleteActivitiesSql:', err);
      
      const deleteActivityMembersSql = 'delete from ActivityMembers';
      db.run(deleteActivityMembersSql, function (err) {
        console.log('[DEBUG]deleteActivityMembersSql:', err);
        console.log('  >', 'deleted all', json);
        ws.send(JSON.stringify(json));        
      });
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
