const express = require('express');
const axios = require('axios');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
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

// Use body-parser to parse JSON requests
app.use(bodyParser.json());

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
        let callid = "";

        activeCalls.forEach(call => {
            call.AConnList.forEach(conn => {
                if (conn.dnNum === extension && conn.status === 'Connected') {
                    extensionConnected = true;
                    callid = call.callID;
                }
                if (conn.externalParty === clientPhone && conn.status === 'Connected') {
                    clientConnected = true;
                }
            });
        });

        return { extensionConnected, clientConnected, callid };
    } catch (error) {
        console.error('Error checking call status:', error);
        return { extensionConnected: false, clientConnected: false };
    }
}

// Function to log call attempts
function logCallAttempt(clientPhone, userExtension, companyId, status, callid,attempt) {
    const query = `INSERT INTO call_logs (client_phone, user_extension, company_id, call_status, callid,attempt) VALUES (?, ?, ?, ?, ?,?)`;
    connection.query(query, [clientPhone, userExtension, companyId, status, callid,attempt], (err, results) => {
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
                let lastStatusResponse = null;

                for (let j = 0; j < 20; j++) { // Polling for up to 20 seconds (20 iterations with 1 second interval)
                    const status = await checkCallStatus(extension.trim(), clientPhone);
                    console.log(`Status check ${j + 1}: ${JSON.stringify(status)}`);
                    var atmpt=j;
                    lastStatusResponse = status.response;

                    if (status.extensionConnected) {
                        logCallAttempt(clientPhone, extension.trim(), companyId, 'connected', status.callid,atmpt);
                        console.log(`Extension ${extension} is connected. Sending data to webhook and stopping further calls.`);
                        const data = { clientPhone, userExtension: extension.trim(), companyId, status, lastStatusResponse };
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



// GET endpoint for initiating calls
app.get('/initiate-call', (req, res) => {
    const { clientPhone, userExtensions, companyId, endpointLoop } = req.query;

    if (!clientPhone || !userExtensions || !companyId || !endpointLoop) {
        return res.status(400).send('Missing required parameters.');
    }

    // Immediately send response and handle the call process in the background
    res.status(200).send('Call process initiated.');

    // Run handleCall asynchronously
    setImmediate(async () => {
        try {
            await handleCall(clientPhone, userExtensions, companyId, parseInt(endpointLoop));
        } catch (error) {
            console.error('Error initiating call process:', error);
        }
    });
});





// GET endpoint to fetch and format timestamp
app.get('/format-timestamp', async (req, res) => {
    const { id } = req.query;  // expecting the record ID as a query parameter

    if (!id) {
        return res.status(400).send('Missing required parameter: Call id that means your call is failed.');
    }

    const query = 'SELECT timestamp, attempt,callid FROM call_logs WHERE callid = ?';

    connection.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error fetching timestamp:', err);
            return res.status(500).send('Error fetching timestamp.');
        }

        if (results.length === 0) {
            return res.status(404).send('Record not found.');
        }

        const { timestamp, attempt,callid } = results[0];

        // Calculate new timestamp by subtracting seconds
        const adjustedTimestamp = new Date(timestamp.getTime() - attempt * 1000);

        // Format new timestamp as 'YYMMDDHHmmss'
        const formattedTimestamp = [
            adjustedTimestamp.getFullYear().toString().slice(2),
            ('0' + (adjustedTimestamp.getMonth() + 1)).slice(-2),
            ('0' + adjustedTimestamp.getDate()).slice(-2),
            ('0' + adjustedTimestamp.getHours()).slice(-2),
            ('0' + adjustedTimestamp.getMinutes()).slice(-2),
            ('0' + adjustedTimestamp.getSeconds()).slice(-2)
        ].join('');
if(attempt<=20)
    {
            // Construct the URL for the MP3 recording
            const recordingUrl = `https://ebmsdxb.3cx.ae:3081/webapi/recording/${formattedTimestamp}_${callid}-1-1.mp3`;

            // Send JSON response with the recording URL
            res.status(200).json({ recordingUrl });
        //res.status(200).send("https://ebmsdxb.3cx.ae:3081/webapi/recording/"+formattedTimestamp+"_"+callid+"-1-1.mp3");
}
else{
    res.status(200).send("No Recording found Client didn't pick the call");

}
    });
});



app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
