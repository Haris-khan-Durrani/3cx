const express = require('express');
const axios = require('axios');
const mysql = require('mysql2');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, THREECX_FQDN, ACCESS_KEY, WEBHOOK_URL } = process.env;

// Create MySQL connection
const connection = mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME
});

connection.connect(err => {
    if (err) throw err;
    console.log('Connected to MySQL database.');
});

// Function to initiate call using GET request
async function initiateCall(agent, clientPhone) {
    try {
        const response = await axios.get(`https://${THREECX_FQDN}/webapi/${ACCESS_KEY}/makecall?first=${agent}&second=${clientPhone}`);
        console.log(`Call initiation response: ${JSON.stringify(response.data)}`);
        return response.data.finalStatus === 'Success';
    } catch (error) {
        console.error('Error initiating call:', error);
        return false;
    }
}

// Function to check if both parties are connected
async function checkCallStatus(extension, clientPhone) {
    try {
        const response = await axios.get(`https://${THREECX_FQDN}/webapi/${ACCESS_KEY}/pbx.ac.get`);
        console.log(`Call status response: ${JSON.stringify(response.data)}`); // Print the status response
        const activeCalls = response.data.AConnByCallID;

        let extensionConnected = false;
        let clientConnected = false;

        activeCalls.forEach(call => {
            call.AConnList.forEach(conn => {
                if (conn.dnNum === extension && conn.status === 'Connected') {
                    extensionConnected = true;
                }
                if (conn.externalParty === clientPhone && conn.status === 'Connected') {
                    clientConnected = true;
                }
            });
        });

        return { extensionConnected, clientConnected };
    } catch (error) {
        console.error('Error checking call status:', error);
        return { extensionConnected: false, clientConnected: false };
    }
}

// Function to log call attempts
function logCallAttempt(clientPhone, userExtension, companyId, status) {
    const query = `INSERT INTO call_logs (client_phone, user_extension, company_id, call_status) VALUES (?, ?, ?, ?)`;
    connection.query(query, [clientPhone, userExtension, companyId, status], (err, results) => {
        if (err) {
            console.error('Failed to log call attempt:', err);
        } else {
            console.log('Call attempt logged successfully.');
        }
    });
}

// Function to send data to webhook
async function sendDataToWebhook(data) {
    try {
        await axios.post(WEBHOOK_URL, data);
    } catch (error) {
        console.error('Error sending data to webhook:', error);
    }
}

// Main function to handle the calling process
async function handleCall(clientPhone, userExtensions, companyId, endpointLoop) {
    const extensions = userExtensions.split(',');

    for (let i = 0; i < endpointLoop; i++) {
        for (const extension of extensions) {
            const callInitiated = await initiateCall(extension.trim(), clientPhone);

            if (callInitiated) {
                logCallAttempt(clientPhone, extension.trim(), companyId, 'in progress');
                console.log(`Call initiation in progress from extension ${extension} to client ${clientPhone}`);

                let bothConnected = false;

                for (let j = 0; j < 20; j++) { // Polling for up to 20 seconds (20 iterations with 1 second interval)
                    const status = await checkCallStatus(extension.trim(), clientPhone);
                    console.log(`Status check ${j + 1}: ${JSON.stringify(status)}`);

                    if (status.extensionConnected) {
                        logCallAttempt(clientPhone, extension.trim(), companyId, 'connected');
                        console.log(`Extension ${extension} is connected. Sending data to webhook and stopping further calls.`);
                        const data = { clientPhone, userExtension: extension.trim(), companyId, status };
                        await sendDataToWebhook(data);
                        console.log('Data sent to webhook.');
                        return; // Stop further calls
                    }

                    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
                }

                if (!bothConnected) {
                    logCallAttempt(clientPhone, extension.trim(), companyId, 'failed');
                    console.log(`Call from extension ${extension} to client ${clientPhone} was not connected.`);
                }
            } else {
                logCallAttempt(clientPhone, extension.trim(), companyId, 'failed');
                console.log(`Failed to initiate call from extension ${extension} to client ${clientPhone}`);
            }
        }
    }

    console.log('Failed to connect the call with all provided extensions.');
}

// GET endpoint
app.get('/initiate-call', async (req, res) => {
    const { clientPhone, userExtensions, companyId, endpointLoop } = req.query;

    if (!clientPhone || !userExtensions || !companyId || !endpointLoop) {
        return res.status(400).send('Missing required parameters.');
    }

    try {
        await handleCall(clientPhone, userExtensions, companyId, parseInt(endpointLoop));
        res.status(200).send('Call process initiated.');
    } catch (error) {
        console.error('Error initiating call process:', error);
        res.status(500).send('Error initiating call process.');
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
