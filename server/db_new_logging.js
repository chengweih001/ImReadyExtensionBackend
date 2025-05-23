// @ts-check
const app = require('apprun').app;
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const webSocket = require('ws');
const winston = require('winston'); // Import the winston library

const DATABASE_FILE = "db/activities.db";
const databaseExists = fs.existsSync(DATABASE_FILE);

// Configure Winston logger
const logger = winston.createLogger({
  level: 'debug', // Set the default logging level
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.colorize(),
    winston.format.simple() // Or use winston.format.printf for more control
    // winston.format.printf(({ level, message, timestamp }) => {
    //   return `${timestamp} [${level}]: ${message}`;
    // })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

logger.info('Using database:', DATABASE_FILE);

// Initialize the database connection
const db = new sqlite3.Database(DATABASE_FILE, (err) => {
  if (err) {
    logger.error('Failed to connect to the database:', err.message);
  } else {
    logger.info('Successfully connected to the database.');
    initializeDatabase();
  }
});

// Function to handle database operations and automatically close the connection
function executeDatabaseQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) {
        logger.error('Database query failed:', err.message, query, params);
        reject(err);
      } else {
        resolve(this); // 'this' context contains lastID and changes
      }
    });
  });
}

function executeDatabaseAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        logger.error('Database query (all) failed:', err.message, query, params);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Function to initialize the database tables if they don't exist
function initializeDatabase() {
  db.serialize(async () => {
    logger.debug('Checking database schema. Exists:', databaseExists);
    if (!databaseExists) {
      await executeDatabaseQuery(`
        CREATE TABLE Activities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          ownerId TEXT NOT NULL
        );
      `);
      logger.info("Activities table created!");

      await executeDatabaseQuery(`
        CREATE TABLE ActivityMembers (
          activityId INTEGER NOT NULL,
          memberId TEXT NOT NULL,
          PRIMARY KEY (activityId, memberId),
          FOREIGN KEY (activityId) REFERENCES Activities(id)
        );
      `);
      logger.info("ActivityMembers table created!");
    }
  });
}

// --- WebSocket Broadcast Functions ---

function broadcast(wss, message) {
  wss.clients.forEach(client => {
    if (client.readyState === webSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

function broadcastActivityDeleted(activityId, wss) {
  logger.debug('Broadcasting ActivityDeleted:', activityId);
  broadcast(wss, { type: 'ActivityDeleted', data: { activityId } });
}

async function broadcastActivityChanged(activityId, wss) {
  logger.debug('Broadcasting ActivityChanged for ID:', activityId);

  try {
    const activities = await executeDatabaseAll(
      'SELECT * FROM Activities WHERE id = ?',
      [activityId]
    );
    logger.debug('Activities found:', JSON.stringify(activities));

    if (activities.length > 0) {
      const members = await executeDatabaseAll(
        'SELECT activityId, memberId FROM ActivityMembers WHERE activityId = ?',
        [activityId]
      );
      logger.debug('Activity members found:', JSON.stringify(members));

      const memberIds = members.map(member => member.memberId);
      const updatedActivity = { ...activities[0], memberIds };

      broadcast(wss, { type: 'ActivityChanged', data: { activity: updatedActivity } });
    }
  } catch (error) {
    logger.error('Error during broadcastActivityChanged:', error);
  }
}

// --- AppRun Event Handlers ---

app.on('GetAllActivities', async (json, ws) => {
  logger.debug('Handling GetAllActivities');
  try {
    const activities = await executeDatabaseAll('SELECT id, name, ownerId FROM Activities');
    const members = await executeDatabaseAll('SELECT activityId, memberId FROM ActivityMembers');

    const activityMembersMap = members.reduce((acc, member) => {
      acc[member.activityId] = acc[member.activityId] || [];
      acc[member.activityId].push(member.memberId);
      return acc;
    }, {});

    const activitiesWithMembers = activities.map(activity => ({
      ...activity,
      memberIds: activityMembersMap[activity.id] || []
    }));

    const response = { ...json, data: { activities: activitiesWithMembers } };
    logger.debug('Sending GetAllActivities response:', JSON.stringify(response));
    ws.send(JSON.stringify(response));
  } catch (error) {
    logger.error('Error fetching all activities:', error);
    ws.send(JSON.stringify({ ...json, error: 'Failed to fetch activities' }));
  }
});

app.on('CreateActivity', async (json, ws, wss) => {
  logger.debug('Handling CreateActivity:', json);
  try {
    const activityResult = await executeDatabaseQuery(
      'INSERT INTO Activities (name, ownerId) VALUES (?, ?)',
      [json.data.name, json.userId]
    );
    const activityId = activityResult.lastID;
    logger.info('Created activity with ID:', activityId);

    await executeDatabaseQuery(
      'INSERT INTO ActivityMembers (activityId, memberId) VALUES (?, ?)',
      [activityId, json.userId]
    );
    logger.info('Added creator to ActivityMembers for activity ID:', activityId, 'user ID:', json.userId);

    const response = { ...json, data: { activityId } };
    ws.send(JSON.stringify(response));
    broadcastActivityChanged(activityId, wss);

  } catch (error) {
    logger.error('Error creating activity:', error);
    ws.send(JSON.stringify({ ...json, error: 'Failed to create activity' }));
  }
});

app.on('JoinActivity', async (json, ws, wss) => {
  logger.debug('Handling JoinActivity:', json);
  try {
    await executeDatabaseQuery(
      'INSERT INTO ActivityMembers (activityId, memberId) VALUES (?, ?)',
      [json.data.activityId, json.userId]
    );
    logger.info('User joined activity:', json.userId, json.data.activityId);
    ws.send(JSON.stringify(json));
    broadcastActivityChanged(json.data.activityId, wss);
  } catch (error) {
    logger.error('Error joining activity:', error);
    ws.send(JSON.stringify({ ...json, error: 'Failed to join activity' }));
  }
});

app.on('LeaveActivity', async (json, ws, wss) => {
  logger.debug('Handling LeaveActivity:', json);
  try {
    const result = await executeDatabaseQuery(
      'DELETE FROM ActivityMembers WHERE activityId = ? AND memberId = ?',
      [json.data.activityId, json.userId]
    );
    logger.info('User left activity. Rows affected:', result.changes);
    ws.send(JSON.stringify(json));
    broadcastActivityChanged(json.data.activityId, wss);
  } catch (error) {
    logger.error('Error leaving activity:', error);
    ws.send(JSON.stringify({ ...json, error: 'Failed to leave activity' }));
  }
});

app.on('StartActivity', async (json, ws, wss) => {
  logger.debug('Handling StartActivity (Delete Activity):', json);
  try {
    const deleteActivityResult = await executeDatabaseQuery(
      'DELETE FROM Activities WHERE id = ? AND ownerId = ?',
      [json.data.activityId, json.userId]
    );
    logger.info('Deleted activity. Rows affected:', deleteActivityResult.changes);

    if (deleteActivityResult.changes > 0) {
      const deleteMembersResult = await executeDatabaseQuery(
        'DELETE FROM ActivityMembers WHERE activityId = ?',
        [json.data.activityId]
      );
      logger.info('Deleted activity members. Rows affected:', deleteMembersResult.changes);
      ws.send(JSON.stringify(json));
      broadcastActivityDeleted(json.data.activityId, wss);
    } else {
      const errorMessage = 'Activity not found or you are not the owner.';
      logger.warn(errorMessage);
      ws.send(JSON.stringify({ ...json, error: errorMessage }));
    }
  } catch (error) {
    logger.error('Error starting (deleting) activity:', error);
    ws.send(JSON.stringify({ ...json, error: 'Failed to start (delete) activity' }));
  }
});

app.on('KeepAlive', (json, ws) => {
  // logger.debug('Handling KeepAlive');
  // ws.send(JSON.stringify({ ...json, type: 'I am alive' }));
});

app.on('@delete-all-activity', async (json, ws) => {
  logger.debug('Handling DeleteAllActivities');
  try {
    await executeDatabaseQuery('DELETE FROM Activities');
    logger.info('Deleted all activities.');
    await executeDatabaseQuery('DELETE FROM ActivityMembers');
    logger.info('Deleted all activity members.');
    ws.send(JSON.stringify(json));
  } catch (error) {
    logger.error('Error deleting all activities:', error);
    ws.send(JSON.stringify({ ...json, error: 'Failed to delete all activities' }));
  }
});

// Close the database connection when the Node.js process exits
process.on('exit', () => {
  db.close((err) => {
    if (err) {
      logger.error('Error closing the database:', err.message);
    } else {
      logger.info('Database connection closed.');
    }
  });
});