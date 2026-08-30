# employee_attendance_api

## Introduction

This is the backend API for the Employee Attendance mobile application.

The API handles employee authentication, registration, attendance time-in/time-out, attendance history, and communication with the MSSQL database.

The API is built using **Node.js** and **Express.js**, with **MSSQL** as the main database.

### Technologies Used

- **Node.js**
  - JavaScript runtime used to run the backend server

- **Express.js**
  - Handles API routes and HTTP requests

- **MSSQL**
  - Main database used to store employee and attendance data

- **mssql**
  - Node.js package used to connect and communicate with the MSSQL database

- **dotenv**
  - Loads environment variables from the `.env` file

- **cors**
  - Enables communication between the API and external applications

## API Structure

The API acts as an intermediary between the Flutter mobile application and the MSSQL database.

```text
Flutter Mobile App
        │
        │ HTTP/REST API Requests
        ▼
   Node.js API
        │
        │ SQL Queries / Data Access
        ▼
      MSSQL
```

The mobile application does not connect directly to the MSSQL database. Database operations are handled through the Node.js API.

## Database

- **MSSQL** — Main database

The API connects to the MSSQL database using credentials stored in environment variables.

## Environment Variables

Create a `.env` file in the root directory of the API:

```env
DB_SERVER=your_server
DB_DATABASE=your_database
DB_USER=your_username
DB_PASSWORD=your_password
DB_PORT=1433
PORT=3000
```

**Note:** Do not upload or commit the `.env` file to GitHub because it contains database credentials.

Make sure `.env` is included in `.gitignore`:

```gitignore
.env
node_modules/
```

## Instructions

### For Development

Make sure **Node.js** is installed on your computer.

Clone the repository and navigate to the API directory:

```bash
cd employee_attendance_api
```

Install the necessary dependencies:

```bash
npm install
```

Create and configure your `.env` file with the MSSQL database credentials.

Start the API:

```bash
node server.js
```

If the server starts successfully, you should see:

```text
API running on port 3000
```

The API can then be accessed locally through:

```text
http://localhost:3000
```

### Testing the API

You can use **Postman** or another API testing tool to test the endpoints.

Example:

```text
POST http://localhost:3000/api/login
```

The API can also be accessed by the Flutter application when both are configured to use the correct API address.

## Deployment

The API can be deployed to a cloud hosting service such as **Render**.

When deployed, the Flutter application should use the public API URL instead of:

```text
http://localhost:3000
```

For example:

```text
https://your-api-url.onrender.com
```

The MSSQL credentials should be configured through the hosting provider's environment variables rather than being stored directly in the source code.

---

**Author:** *John Lorenz Codilla*
