// @ts-check
const app = require('apprun').app;
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs')
const dbFile = "db/todo.db";
const exists = fs.existsSync(dbFile);
const webSocket = require('ws');

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

function broadcast(json, wss) {
  console.log('[DEBUG]broadcast:', json);
  wss.clients.forEach(function each(client) {
    if (client.readyState === webSocket.OPEN) {
      client.send(JSON.stringify(json));
    }
  });  
}

// function broadcastActivityChanged(activityId, wss) {
//   console.log('[DEBUG]broadcastActivityChanged:', activityId);

//   using(db => {
//     const sql = 'select * from Activities where id=?';
//     db.get(sql, activityId, function (err, row) {
//       // json.state = row;
//       // console.log('  >', json);
//       ws.send(JSON.stringify(json));
//     });
//   });  
  
  
//   wss.clients.forEach(function each(client) {
//     if (client.readyState === webSocket.OPEN) {
//       client.send(JSON.stringify(json));
//     }
//   });  
// }

app.on('GetAllActivities', (json, ws) => {
// app.on('@get-all-activity', (json, ws) => {
  using(db => {
    const sql = 'select * from Activities';
    db.all(sql, function (err, activities) {
      console.log('[DEBUG]Activities table\n', activities);            
      // json.state = rows || [];
      console.log('[DEBUG]', err);         
      
      const activityMembersSql = 'select * from ActivityMembers';
      db.all(activityMembersSql, function (err, members) {
        // json.state = rows || [];
        console.log('[DEBUG]ActivityMembers table\n', members);
        
        const activityMembersMap = {};
        members.forEach(member => {
          if (!activityMembersMap[member.activityId]) {
            activityMembersMap[member.activityId] = [];
          }
          activityMembersMap[member.activityId].push(member.memberId);
        });        
        const updatedActivities = activities.map(activity => ({
          ...activity,
          memberIds: activityMembersMap[activity.id] || []
        }));        
        
        json.state = updatedActivities;
        console.log('  >', json);
        ws.send(JSON.stringify(json));
      });          
    });
  });
});

app.on('CreateActivity', (json, ws, wss) => {
  using(db => {
    const activitySql = 'insert into Activities (name, ownerId) values (?,?)';
    db.run(activitySql, json.data.name, json.userId, function (e) {
      console.log('[DEBUG]', e);
      json.data.activityId = this.lastID;
      console.log('  >', 'created activity', json);

      // Now, insert the creator into the ActivityMembers table
      const memberSql = 'insert into ActivityMembers (activityId, memberId) values (?,?)';
      db.run(memberSql, this.lastID, json.userId, function (memberError) {
        console.log('[DEBUG]', memberError);
        if (memberError) {
          console.error('Error adding creator to ActivityMembers:', memberError);
          // You might want to handle this error, perhaps by rolling back the Activities insertion
          // or sending an error message to the client.
        } else {
          console.log('  >', 'added creator to ActivityMembers', { activityId: this.lastID, userId: json.userId });
        }
        ws.send(JSON.stringify(json)); // Send the response back to the client after both insertions
        // broadcast({type: 'ActivityChanged'}, wss);
      });
    });
  });
});  
  
// app.on('@create-activity', (json, ws) => {
//   using(db => {
//     const activitySql = 'insert into Activities (name, ownerId) values (?,?)';
//     db.run(activitySql, json.state.name, json.state.userId, function (e) {
//       console.log('[DEBUG]', e);
//       json.state.activityId = this.lastID;
//       console.log('  >', 'created activity', json);

//       // Now, insert the creator into the ActivityMembers table
//       const memberSql = 'insert into ActivityMembers (activityId, memberId) values (?,?)';
//       db.run(memberSql, this.lastID, json.state.userId, function (memberError) {
//         console.log('[DEBUG]', memberError);
//         if (memberError) {
//           console.error('Error adding creator to ActivityMembers:', memberError);
//           // You might want to handle this error, perhaps by rolling back the Activities insertion
//           // or sending an error message to the client.
//         } else {
//           console.log('  >', 'added creator to ActivityMembers', { activityId: this.lastID, userId: json.state.userId });
//         }
//         ws.send(JSON.stringify(json)); // Send the response back to the client after both insertions
//       });
//     });
//   });
// });

app.on('JoinActivity', (json, ws) => {
  using(db => {
    const sql = 'insert into ActivityMembers (activityId, memberId) values (?,?)';
    db.run(sql, json.data.activityId, json.userId, function () {
      // json.state.ip = json.ip;
      console.log('  >', 'joined', json);
      ws.send(JSON.stringify(json));
    });
  });
});  
// app.on('@join-activity', (json, ws) => {
//   using(db => {
//     const sql = 'insert into ActivityMembers (activityId, memberId) values (?,?)';
//     db.run(sql, json.state.activityId, json.state.userId, function () {
//       json.state.ip = json.ip;
//       console.log('  >', 'joined', json);
//       ws.send(JSON.stringify(json));
//     });
//   });
// });

app.on('LeaveActivity', (json, ws) => {
  using(db => {
    const sql = 'delete from ActivityMembers where activityId=? and memberId=?';
    db.run(sql, json.data.activityId, json.userId, function () {
      console.log('  >', 'deleted', json);
      ws.send(JSON.stringify(json));
    });
  });
});
// app.on('@leave-activity', (json, ws) => {
//   using(db => {
//     const sql = 'delete from ActivityMembers where activityId=? and memberId=?';
//     db.run(sql, json.state.activityId, json.state.userId, function () {
//       console.log('  >', 'deleted', json);
//       ws.send(JSON.stringify(json));
//     });
//   });
// });


app.on('StartActivity', (json, ws) => {
  using(db => {
    const deleteActivitiesSql = 'delete from Activities where id=? and ownerId=?';
    db.run(deleteActivitiesSql, json.data.activityId, json.userId, function (err) {
      console.log('[DEBUG]deleteActivitiesSql:', err);
      
      // TODO: Proceed only if sucessfully deleted from Activities table.
      const deleteActivityMembersSql = 'delete from ActivityMembers where activityId=?';
      db.run(deleteActivityMembersSql, json.data.activityId, function (err) {
        console.log('[DEBUG]deleteActivityMembersSql:', err);
        console.log('  >', 'deleted', json);
        ws.send(JSON.stringify(json));        
      });
    });
  });
});  
// app.on('@start-activity', (json, ws) => {
//   using(db => {
//     const deleteActivitiesSql = 'delete from Activities where id=? and ownerId=?';
//     db.run(deleteActivitiesSql, json.state.activityId, json.state.userId, function (err) {
//       console.log('[DEBUG]deleteActivitiesSql:', err);
      
//       // TODO: Proceed only if sucessfully deleted from Activities table.
//       const deleteActivityMembersSql = 'delete from ActivityMembers where activityId=?';
//       db.run(deleteActivityMembersSql, json.state.activityId, function (err) {
//         console.log('[DEBUG]deleteActivityMembersSql:', err);
//         console.log('  >', 'deleted', json);
//         ws.send(JSON.stringify(json));        
//       });
//     });
//   });
// });

app.on('KeepAlive', (json, ws) => {
  using(db => {
    ws.send(JSON.stringify({ ...json, type: 'I am alive' }));
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
