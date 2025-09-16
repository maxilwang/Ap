const express = require('express');
const mysql = require('mysql2/promise');
const http = require('http');
const app = express();
const port = 3000;

// Database configuration
const dbConfig = {
    host: '0.0.0.0',
    user: 'root',
    password: 'Xolisa@1986',
    database: 'metrics',
    connectionLimit: 10 // Add connection limit for pool
};

// Create database pool
const pool = mysql.createPool(dbConfig);

// Helper function to format date to YYYY-MM-DD
const formatDate = (date) => {
    return date.toISOString().split('T')[0];
};

// Helper function to get previous month's start and end dates
const getPreviousMonthDates = () => {
    const date = new Date();
    // Set to first day of previous month
    date.setDate(1);
    date.setMonth(date.getMonth() - 1);
    const startOfMonth = formatDate(date);
    // Set to last day of previous month
    date.setMonth(date.getMonth() + 1);
    date.setDate(0);
    const endOfMonth = formatDate(date);
    return { startOfMonth, endOfMonth };
};

// API endpoint to get dashboard data
app.get('/api/dashboard', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        // Prepare queries
        const queries = {
            users: 'SELECT MAX(id) as count FROM user',
            reports: 'SELECT MAX(id) as count FROM template',
            months: `
        SELECT COUNT(*) as count
        FROM template
        WHERE date(created_at) >= date(?)
        AND date(created_at) < date(?)
      `
        };

        // Get previous month's start and end dates
        const { startOfMonth, endOfMonth } = getPreviousMonthDates();

        // Execute queries concurrently for better performance
        const [usersResult, reportsResult, monthsResult] = await Promise.all([
            connection.query(queries.users),
            connection.query(queries.reports),
            connection.query(queries.months, [startOfMonth, endOfMonth])
        ]);

        // Format response
        const response = {
            success: true,
            heading: 'Metrics Stats',
            data: {

                users: usersResult[0][0].count,
                reports: reportsResult[0][0].count,
                months: monthsResult[0][0].count,
                currentMonth: new Date().toLocaleString('default', { month: 'long' })
            }
        };
        res.json(response);
    } catch (error) {
        console.error('Dashboard API Error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    } finally {
        // Always release connection back to pool
        if (connection) {
            connection.release();
        }
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!'
    });
});

// Create HTTP server and attach Express app
const server = http.createServer(app);

// Start server
server.listen(port, () => {
    console.log(`Server is running on ${port}`);
});

// Handle process termination
process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received. Closing HTTP server and DB pool...');
    await pool.end();
    process.exit(0);
});