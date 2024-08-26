# 3CX Call Management Application

This Node.js application allows you to manage calls, check extension statuses, initiate calls, and log call attempts using the 3CX API. The app connects to a MySQL database to store call logs and integrates with a webhook for sending data.

## Features

- **Check Extension Status**: Check if an extension is free or busy.
- **Initiate Calls**: Start calls between an agent and a client.
- **Log Call Attempts**: Store call attempt details in a MySQL database.
- **Webhook Integration**: Send call data to a specified webhook URL.
- **Randomized Extension Selection**: Shuffle and attempt calls from a list of available extensions.
- **Agent Connection Tracking**: Ensure an agent is connected before sending data to the webhook.

## Requirements

- Node.js
- MySQL
- 3CX API credentials
- Axios for HTTP requests
- Body-Parser and CORS for handling requests and enabling CORS

## Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/yourusername/3cx-call-management.git
    cd 3cx-call-management
    ```

2. Install the dependencies:
    ```bash
    npm install
    ```

3. Configure MySQL connection:
    - Update the MySQL connection details in `index.js`:
    ```javascript
    const connection = mysql.createConnection({
        host: 'localhost',
        user: 'your-username',
        password: 'your-password',
        database: 'your-database'
    });
    ```

4. Start the application:
    ```bash
    node index.js
    ```

## Usage

### Initiate Call

To initiate a call, send a GET request to the `/initiate-call` endpoint with the following query parameters:

- `clientPhone`: The client's phone number.
- `companyId`: The ID of the company.
- `endpointLoop`: The number of times to loop through the available extensions.
- `name`: The client's name.

Example:

```bash
http://localhost:8015/initiate-call?clientPhone=1234567890&companyId=1&endpointLoop=3&name=John
