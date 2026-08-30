require('dotenv').config();

const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const crypto = require('crypto');

const app = express();

app.use(cors());
app.use(express.json());

const dbConfig = {
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: true,
        trustServerCertificate: false,
    },
};

let pool;

// DB connection testing
async function connectionDatabase() {
    try {
        pool = await sql.connect(dbConfig);

        console.log('Connected to MSSQL successfulyl.');
    } catch (error) {
        console.error('MSSQL connection failed: ');
        console.error(error);
    }
}

// helper function for time in/out
function toUtcIso(date) {
  return new Date(date).toISOString();
}

// Test if localhost Api is running
app.get('/', (req, res) => {
    res.json({
        message: 'Employee Attendance API is running.',
    });
});


// DB connection verification
app.get('/api/test-db', async(req, res) => {
    try {
        const result = await pool.request().query(
            'SELECT 1 AS connected'
        );

        res.json({
            success: true,
            database: result.recordset[0],
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Database connection failed.',
        });
    }
});

// login
app.post('/api/login', async (req, res) => {
  try {
    const { employee_id, password } = req.body;

    if (!employee_id || !password) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID and password are required.',
      });
    }

    const passwordHash = crypto
      .createHash('md5')
      .update(password)
      .digest('hex');

    const result = await pool
      .request()
      .input('employee_id', sql.VarChar(50), employee_id)
      .input('password', sql.VarChar(32), passwordHash)
      .query(`
        SELECT
          uid,
          employee_id,
          full_name
        FROM users
        WHERE employee_id = @employee_id
          AND password = @password
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid employee ID or password.',
      });
    }

    const user = result.recordset[0];

    return res.json({
      success: true,
      user: {
        uid: user.uid,
        employee_id: user.employee_id,
        full_name: user.full_name,
      },
    });
  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    });
  }
});

// register
app.post('/api/register', async (req, res) => {
  try {
    const { employee_id, full_name, password } = req.body;

    if (!employee_id || !full_name || !password) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, full name, and password are required.',
      });
    }

    // Check if employee ID already exists
    const existingUser = await pool
      .request()
      .input(
        'employee_id',
        sql.VarChar(50),
        employee_id.trim()
      )
      .query(`
        SELECT uid
        FROM users
        WHERE employee_id = @employee_id
      `);

    if (existingUser.recordset.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Employee ID is already registered.',
      });
    }

    // Hash password using MD5
    const passwordHash = crypto
      .createHash('md5')
      .update(password)
      .digest('hex');

    // Create user
    const result = await pool
      .request()
      .input(
        'employee_id',
        sql.VarChar(50),
        employee_id.trim()
      )
      .input(
        'password',
        sql.VarChar(32),
        passwordHash
      )
      .input(
        'full_name',
        sql.VarChar(100),
        full_name.trim()
      )
      .query(`
        INSERT INTO users
            (employee_id, password, full_name)
        OUTPUT
            INSERTED.uid,
            INSERTED.employee_id,
            INSERTED.full_name
        VALUES
            (@employee_id, @password, @full_name)
      `);

    const user = result.recordset[0];

    return res.status(201).json({
      success: true,
      message: 'Registration successful.',
      user: {
        uid: user.uid,
        employee_id: user.employee_id,
        full_name: user.full_name,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    });
  }
});

// time in
app.post('/api/attendance/time-in', async (req, res) => {
  try {
    const { user_uid, latitude, longitude, created_at } = req.body;

    if (!user_uid || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'User UID and location are required.',
      });
    }

    // Make sure the employee exists
    const userResult = await pool
      .request()
      .input(
        'uid',
        sql.UniqueIdentifier,
        user_uid
      )
      .query(`
        SELECT uid
        FROM users
        WHERE uid = @uid
      `);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found.',
      });
    }

    // Check whether the employee is already timed in.
    const latestResult = await pool
      .request()
      .input(
        'user_uid',
        sql.UniqueIdentifier,
        user_uid
      )
      .query(`
        SELECT TOP 1
          action,
          created_at
        FROM attendance_logs
        WHERE user_uid = @user_uid
        ORDER BY created_at DESC
      `);

    if (
      latestResult.recordset.length > 0 &&
      latestResult.recordset[0].action === 'TIME_IN'
    ) {
      return res.status(409).json({
        success: false,
        message: 'Employee is already timed in.',
      });
    }

    // Create TIME_IN record
    const timestamp = created_at
    ? new Date(created_at)
    : new Date();

    const result = await pool
      .request()
      .input(
          'user_uid',
          sql.UniqueIdentifier,
          user_uid
      )
      .input(
          'action',
          sql.VarChar(10),
          'TIME_IN'
      )
      .input(
          'latitude',
          sql.Decimal(10, 7),
          latitude
      )
      .input(
          'longitude',
          sql.Decimal(10, 7),
          longitude
      )
      .input(
        'created_at',
        sql.DateTime2,
        timestamp
      )
      .query(`
          INSERT INTO attendance_logs
          (
          user_uid,
          action,
          latitude,
          longitude,
          created_at
          )
          OUTPUT
          INSERTED.id,
          INSERTED.user_uid,
          INSERTED.action,
          INSERTED.latitude,
          INSERTED.longitude,
          INSERTED.created_at
          VALUES
          (
          @user_uid,
          @action,
          @latitude,
          @longitude,
          @created_at
          )
      `);

    const attendance = result.recordset[0];

    attendance.created_at =
      toUtcIso(attendance.created_at);

    return res.status(201).json({
      success: true,
      message: 'Time in recorded successfully.',
      attendance,
    });
  } catch (error) {
    console.error('Time in error:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    });
  }
});

// time out
app.post('/api/attendance/time-out', async (req, res) => {
  try {
    const { user_uid, latitude, longitude, created_at } = req.body;

    if (!user_uid || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'User UID and location are required.',
      });
    }

    // Check that the employee exists
    const userResult = await pool
      .request()
      .input('uid', sql.UniqueIdentifier, user_uid)
      .query(`
        SELECT uid
        FROM users
        WHERE uid = @uid
      `);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found.',
      });
    }

    // Get the latest attendance action
    const latestResult = await pool
      .request()
      .input('user_uid', sql.UniqueIdentifier, user_uid)
      .query(`
        SELECT TOP 1
          action,
          created_at
        FROM attendance_logs
        WHERE user_uid = @user_uid
        ORDER BY created_at DESC
      `);

    // Employee must currently be timed in
    if (
      latestResult.recordset.length === 0 ||
      latestResult.recordset[0].action !== 'TIME_IN'
    ) {
      return res.status(409).json({
        success: false,
        message: 'Employee is not currently timed in.',
      });
    }

    const timestamp = created_at
    ? new Date(created_at)
    : new Date();

    // Create TIME_OUT record
    const result = await pool
      .request()
      .input(
        'user_uid',
        sql.UniqueIdentifier,
        user_uid
      )
      .input(
        'action',
        sql.VarChar(10),
        'TIME_OUT'
      )
      .input(
        'latitude',
        sql.Decimal(10, 7),
        latitude
      )
      .input(
        'longitude',
        sql.Decimal(10, 7),
        longitude
      )
      .input(
        'created_at',
        sql.DateTime2,
        timestamp
      )
      .query(`
        INSERT INTO attendance_logs
        (
          user_uid,
          action,
          latitude,
          longitude,
          created_at
        )
        OUTPUT
          INSERTED.id,
          INSERTED.user_uid,
          INSERTED.action,
          INSERTED.latitude,
          INSERTED.longitude,
          INSERTED.created_at
        VALUES
        (
          @user_uid,
          @action,
          @latitude,
          @longitude,
          @created_at
        )
      `);

    const attendance = result.recordset[0];

    attendance.created_at =
      toUtcIso(attendance.created_at);

    return res.status(201).json({
      success: true,
      message: 'Time out recorded successfully.',
      attendance,
    });
  } catch (error) {
    console.error('Time out error:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    });
  }
});

// attendance history
app.get('/api/attendance/history/:user_uid', async (req, res) => {
  try {
    const { user_uid } = req.params;

    if (!user_uid) {
      return res.status(400).json({
        success: false,
        message: 'User UID is required.',
      });
    }

    const result = await pool
      .request()
      .input(
        'user_uid',
        sql.UniqueIdentifier,
        user_uid
      )
      .query(`
        SELECT
          id,
          user_uid,
          action,
          latitude,
          longitude,
          created_at
        FROM attendance_logs
        WHERE user_uid = @user_uid
        ORDER BY created_at DESC
      `);

    return res.json({
      success: true,
      attendance: result.recordset,
    });
  } catch (error) {
    console.error('Attendance history error:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    });
  }
});

// get user profile
app.get('/api/users/:uid', async (req, res) => {
  try {
    const { uid } = req.params;

    const result = await pool
      .request()
      .input('uid', sql.UniqueIdentifier, uid)
      .query(`
        SELECT
          uid,
          employee_id,
          full_name
        FROM users
        WHERE uid = @uid
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found.',
      });
    }

    return res.json({
      success: true,
      user: result.recordset[0],
    });
  } catch (error) {
    console.error('Profile error:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    });
  }
});

// get attendance status
app.get('/api/attendance/status/:user_uid', async (req, res) => {
  try {
    const { user_uid } = req.params;

    const latestResult = await pool
      .request()
      .input(
        'user_uid',
        sql.UniqueIdentifier,
        user_uid
      )
      .query(`
        SELECT TOP 1
          id,
          action,
          created_at
        FROM attendance_logs
        WHERE user_uid = @user_uid
        ORDER BY created_at DESC, id DESC
      `);

    if (latestResult.recordset.length === 0) {
      return res.json({
        success: true,
        is_timed_in: false,
        time_in: null,
        time_out: null,
      });
    }

    const latest = latestResult.recordset[0];

    // Currently timed in
    if (latest.action === 'TIME_IN') {
      return res.json({
        success: true,
        is_timed_in: true,
        time_in: latest.created_at,
        time_out: null,
      });
    }

    // Currently timed out.
    // Find the TIME_IN immediately before this TIME_OUT.
    const timeInResult = await pool
      .request()
      .input(
        'user_uid',
        sql.UniqueIdentifier,
        user_uid
      )
      .input(
        'time_out',
        sql.DateTime2,
        latest.created_at
      )
      .query(`
        SELECT TOP 1
          created_at
        FROM attendance_logs
        WHERE user_uid = @user_uid
          AND action = 'TIME_IN'
          AND created_at <= @time_out
        ORDER BY created_at DESC, id DESC
      `);

    const timeIn =
        timeInResult.recordset.length > 0
          ? timeInResult.recordset[0].created_at
          : null;

    return res.json({
      success: true,
      is_timed_in: false,
      time_in: timeIn,
      time_out: latest.created_at,
    });

  } catch (error) {
    console.error('Attendance status error:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    });
  }
});

// Database Connection
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log(`API running on port ${PORT}`);

    await connectionDatabase();
});