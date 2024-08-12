const express = require('express');
const axios = require('axios');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 8015;

// MySQL connection details
const connection = mysql.createConnection({
    host: 'localhost',
    user: '3cxbro',
    password: '3cxbro',
    database: '3cxbro'
});

connection.connect(err => {
    if (err) throw err;
    console.log('Connected to MySQL database.');
});

// Use body-parser to parse JSON requests
app.use(bodyParser.json());
app.use(cors());
// Function to fetch company data from the URL
async function fetchCompanyData() {
    try {
        const response = await axios.get('https://checklist.crmsoftware.ae/all3cx');
        return response.data;
    } catch (error) {
        console.error('Error fetching company data:', error);
        return [];
    }
}

// Function to check the status of an extension
async function checkExtensionStatus(companyData, extension) {
    try {
        const { fqdn, ackey } = companyData;
        const response = await axios.get(`https://${fqdn}/webapi/${ackey}/ext.state.get?num=${extension}`);
        console.log(`Extension status: ${JSON.stringify(response.data)}`);
        return response.data.status === 'Free';
    } catch (error) {
        console.error('Error checking extension status:', error);
        return false;
    }
}

// Function to initiate call using GET request
async function initiateCall(companyData, agent, clientPhone) {
    try {
        const { fqdn, ackey } = companyData;
        const response = await axios.get(`https://${fqdn}/webapi/${ackey}/makecall?first=${agent}&second=${clientPhone}`);
        console.log(`Call initiation response: ${JSON.stringify(response.data)}`);
        return response.data.finalStatus === 'Success';
    } catch (error) {
        console.error('Error initiating call:', error);
        return false;
    }
}

// Function to check if both parties are connected
async function checkCallStatus(companyData, extension, clientPhone) {
    try {
        const { fqdn, ackey } = companyData;
        const response = await axios.get(`https://${fqdn}/webapi/${ackey}/pbx.ac.get`);
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

// Function to fetch extension information
async function fetchExtensionInfo(companyData, extension) {
    try {
        const { fqdn, ackey } = companyData;
        const response = await axios.get(`https://${fqdn}/webapi/${ackey}/ext.info.get?num=${extension}`);
        console.log(`Extension info: ${JSON.stringify(response.data)}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching extension info:', error);
        return null;
    }
}

// Function to log call attempts
// function logCallAttempt(clientPhone, userExtension, companyId, status, callid, attempt) {
//     // Get the current time in GMT+4 (Dubai time)
//     const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai', hour12: false });
//     // const query = `INSERT INTO call_logs (client_phone, user_extension, company_id, call_status, callid, attempt) VALUES (?, ?, ?, ?, ?, ?)`;
//     // connection.query(query, [clientPhone, userExtension, companyId, status, callid, attempt], (err, results) => {
//     //     if (err) {
//     //         console.error('Failed to log call attempt:', err);
//     //     } else {
//     //         console.log('Call attempt logged successfully.');
//     //     }
//     // });
    
//      const query = `INSERT INTO call_logs (client_phone, user_extension, company_id, call_status, callid, attempt, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`;
//     connection.query(query, [clientPhone, userExtension, companyId, status, callid, attempt, timestamp], (err, results) => {
//         if (err) {
//             console.error('Failed to log call attempt:', err);
//         } else {
//             console.log('Call attempt logged successfully.');
//         }
//     });
    
// }


function logCallAttempt(clientPhone, userExtension, companyId, status, callid, attempt) {
    // Get the current time in GMT+4 (Dubai time) and format it to 'YYYY-MM-DD HH:MM:SS'
    const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dubai' });
    var at=attempt-1;
    // Format the date to MySQL's expected format
    const [day, month, year] = now.split(', ')[0].split('/');
    const time = now.split(', ')[1];
    const timestamp = `${year}-${month}-${day} ${time}`;

    const query = `INSERT INTO call_logs (client_phone, user_extension, company_id, call_status, callid, attempt, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    connection.query(query, [clientPhone, userExtension, companyId, status, callid, at, timestamp], (err, results) => {
        if (err) {
            console.error('Failed to log call attempt:', err);
        } else {
            console.log('Call attempt logged successfully.');
        }
    });
}



// Function to send data to webhook
async function sendDataToWebhook(companyData, data) {
    try {
        const { dhiturl } = companyData;
        await axios.post(dhiturl, data);
    } catch (error) {
        console.error('Error sending data to webhook:', error);
    }
}

// Function to shuffle an array (randomize the order)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Main function to handle the calling process with extension status check
// async function handleCall(clientPhone, companyId, endpointLoop,name) {
//     const companyData = await fetchCompanyData();
//     const selectedCompany = companyData.find(company => company.cid == companyId);

//     if (!selectedCompany) {
//         console.error('Company data not found for companyId:', companyId);
//         return;
//     }

//     let extensions = selectedCompany.extension.split(',');
//     extensions = shuffleArray(extensions); // Randomize the order of extensions

//     for (let i = 0; i < endpointLoop; i++) {
//         for (const extension of extensions) {
//             const isExtensionFree = await checkExtensionStatus(selectedCompany, extension.trim());

//             if (isExtensionFree) {
//                 const callInitiated = await initiateCall(selectedCompany, extension.trim(), clientPhone);

//                 if (callInitiated) {
//                     logCallAttempt(clientPhone, extension.trim(), companyId, 'in progress');
//                     console.log(`Call initiation in progress from extension ${extension} to client ${clientPhone}`);

//                     let bothConnected = false;
//                     let lastStatusResponse = null;

//                     for (let j = 0; j < 35; j++) { // Polling for up to 20 seconds (20 iterations with 1 second interval)
//                         const status = await checkCallStatus(selectedCompany, extension.trim(), clientPhone);
//                         console.log(`Status check ${j + 1}: ${JSON.stringify(status)}`);
//                         var atmpt = j;
//                         lastStatusResponse = status.response;

//                         if (status.extensionConnected) {
//                             logCallAttempt(clientPhone, extension.trim(), companyId, 'connected', status.callid, atmpt);
//                             console.log(`Extension ${extension} is connected. Fetching extension info and sending data to webhook.`);

//                             // Fetch extension information
//                             const extensionInfo = await fetchExtensionInfo(selectedCompany, extension.trim());

//                             // Prepare data to be sent to the webhook
//                             const data = {
//                                 clientPhone,
//                                 name,
//                                 userExtension: extension.trim(),
//                                 companyId,
//                                 status,
//                                 lastStatusResponse,
//                                 extensionInfo
//                             };

//                             // Send data to the webhook
//                             await sendDataToWebhook(selectedCompany, data);
//                             console.log('Data sent to webhook.');
//                             return; // Stop further calls
//                         }

//                         await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
//                     }

//                     if (!bothConnected) {
//                         logCallAttempt(clientPhone, extension.trim(), companyId, 'failed', "", "");
//                         console.log(`Call from extension ${extension} to client ${clientPhone} was not connected.`);
//                     }
//                 } else {
//                     logCallAttempt(clientPhone, extension.trim(), companyId, 'failed', "", "");
//                     console.log(`Failed to initiate call from extension ${extension} to client ${clientPhone}`);
//                 }
//             } else {
//                 console.log(`Extension ${extension} is not free. Moving to the next extension.`);
//             }
//         }
//     }



// const noagentconnect="yes";
//  const data = {
//                                 clientPhone,
//                                 name,
//                                 userExtension: extension.trim(),
//                                 companyId,
//                                 status,
//                                 lastStatusResponse,
//                                 extensionInfo,
//                                 noagentconnect
//                             };

//                             // Send data to the webhook
//                             await sendDataToWebhook(selectedCompany, data);
//                             console.log('Data sent to webhook.');

//     console.log('Failed to connect the call with all provided extensions.');
// }




async function handleCall(clientPhone, companyId, endpointLoop, name) {
    const companyData = await fetchCompanyData();
    const selectedCompany = companyData.find(company => company.cid == companyId);

    if (!selectedCompany) {
        console.error('Company data not found for companyId:', companyId);
        return;
    }

    let extensions = selectedCompany.extension.split(',');
    extensions = shuffleArray(extensions); // Randomize the order of extensions

    let agentConnected = false; // Track if any agent connected

    for (let i = 0; i < endpointLoop; i++) {
        for (const extension of extensions) {
            const isExtensionFree = await checkExtensionStatus(selectedCompany, extension.trim());

            if (isExtensionFree) {
                const callInitiated = await initiateCall(selectedCompany, extension.trim(), clientPhone);

                if (callInitiated) {
                    logCallAttempt(clientPhone, extension.trim(), companyId, 'in progress', "", "");
                    console.log(`Call initiation in progress from extension ${extension} to client ${clientPhone}`);

                    let bothConnected = false;
                    let lastStatusResponse = null;

                    for (let j = 0; j < 60; j++) { // Polling for up to 35 seconds (35 iterations with 1 second interval)
                        const status = await checkCallStatus(selectedCompany, extension.trim(), clientPhone);
                        console.log(`Status check ${j + 1}: ${JSON.stringify(status)}`);
                        var atmpt = j;
                        lastStatusResponse = status.response;

                        if (status.extensionConnected) {
                            agentConnected = true;
                            logCallAttempt(clientPhone, extension.trim(), companyId, 'connected', status.callid, atmpt);
                            console.log(`Extension ${extension} is connected. Fetching extension info and sending data to webhook.`);

                            // Fetch extension information
                            const extensionInfo = await fetchExtensionInfo(selectedCompany, extension.trim());

                            // Prepare data to be sent to the webhook
                            const data = {
                                clientPhone,
                                name,
                                userExtension: extension.trim(),
                                companyId,
                                status,
                                lastStatusResponse,
                                extensionInfo
                            };

                            // Send data to the webhook
                            await sendDataToWebhook(selectedCompany, data);
                            console.log('Data sent to webhook.');
                            return; // Stop further calls
                        }

                        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
                    }

                    if (!bothConnected) {
                        logCallAttempt(clientPhone, extension.trim(), companyId, 'failed', "", "");
                        console.log(`Call from extension ${extension} to client ${clientPhone} was not connected.`);
                    }
                } else {
                    logCallAttempt(clientPhone, extension.trim(), companyId, 'failed', "", "");
                    console.log(`Failed to initiate call from extension ${extension} to client ${clientPhone}`);
                }
            } else {
                console.log(`Extension ${extension} is not free. Moving to the next extension.`);
            }
        }
    }

    if (!agentConnected) {
        const noagentconnect = "yes";
        const data = {
            clientPhone,
            name,
            userExtension: "",  // No agent connected, so no specific extension
            companyId,
            noagentconnect
        };

        // Send data to the webhook
        await sendDataToWebhook(selectedCompany, data);
        console.log('Data sent to webhook due to no agent connection.');
    }

    console.log('Failed to connect the call with all provided extensions.');
}


// GET endpoint for initiating calls
app.get('/initiate-call', (req, res) => {
    const { clientPhone, companyId, endpointLoop,name } = req.query;

    if (!clientPhone || !companyId || !endpointLoop) {
        return res.status(400).send('Missing required parameters.');
    }

    // Immediately send response and handle the call process in the background
    res.status(200).send('Call process initiated.');

    // Run handleCall asynchronously
    setImmediate(async () => {
        try {
            await handleCall(clientPhone, companyId, parseInt(endpointLoop),name);
        } catch (error) {
            console.error('Error initiating call process:', error);
        }
    });
});

// GET endpoint to fetch and format timestamp
// app.get('/format-timestamp', async (req, res) => {
//     const { id } = req.query;  // expecting the record ID as a query parameter

//     if (!id) {
//         return res.status(400).send('Missing required parameter: Call id that means your call is failed.');
//     }

//     const query = 'SELECT timestamp, attempt, callid,company_id FROM call_logs WHERE callid = ?';
// //const query = 'SELECT timestamp, attempt, callid,company_id FROM call_logs WHERE callid = ?';
// //SELECT  client_phone, user_extension, company_id, call_status,CONVERT_TZ(`timestamp`, 'UTC', 'Asia/Dubai') AS `timestamp` FROM call_logs;
//     connection.query(query, [id], async (err, results) => {
//         if (err) {
//             console.error('Error fetching timestamp:', err);
//             return res.status(500).send('Error fetching timestamp.');
//         }

//         if (results.length === 0) {
//             return res.status(404).send('Record not found.');
//         }

//         const { timestamp, attempt, callid, company_id } = results[0];
// //attempt-=1;
//         // Calculate new timestamp by
//         // Calculate new timestamp by subtracting seconds
//         const adjustedTimestamp = new Date(timestamp.getTime() - attempt * 1000);

//         // Format new timestamp as 'YYMMDDHHmmss'
//         const formattedTimestamp = [
//             adjustedTimestamp.getFullYear().toString().slice(2),
//             ('0' + (adjustedTimestamp.getMonth() + 1)).slice(-2),
//             ('0' + adjustedTimestamp.getDate()).slice(-2),
//             ('0' + adjustedTimestamp.getHours()).slice(-2),
//             ('0' + adjustedTimestamp.getMinutes()).slice(-2),
//             ('0' + adjustedTimestamp.getSeconds()).slice(-2)
//         ].join('');

//         const companyData = await fetchCompanyData();
//         const selectedCompany = companyData.find(company => company.cid == company_id);

//         if (attempt <= 20) {
//             const recordingUrl = `https://${selectedCompany.fqdn}/webapi/recording/${formattedTimestamp}_${callid}-1-1.mp3`;

//             res.status(200).json({ recordingUrl });
//         } else {
//             res.status(200).send("No Recording found. Client didn't pick the call.");
//         }
//     });
// });




// app.get('/format-timestamp', async (req, res) => {
//     const { id } = req.query;  // expecting the record ID as a query parameter

//     if (!id) {
//         return res.status(400).send('Missing required parameter: Call id that means your call is failed.');
//     }

//     // Fetch company data
//     const companyData = await fetchCompanyData();
    
//     // Assuming company_id is known and fixed for this example
//   //  const company_id = '1234';  // You should set this dynamically based on your logic
//         const query = 'SELECT timestamp, attempt, callid,company_id FROM call_logs WHERE callid = ?';
// //const query = 'SELECT timestamp, attempt, callid,company_id FROM call_logs WHERE callid = ?';
// //SELECT  client_phone, user_extension, company_id, call_status,CONVERT_TZ(`timestamp`, 'UTC', 'Asia/Dubai') AS `timestamp` FROM call_logs;
//     connection.query(query, [id], async (err, results) => {
//         if (err) {
//             console.error('Error fetching timestamp:', err);
//             return res.status(500).send('Error fetching timestamp.');
//         }

//         if (results.length === 0) {
//             return res.status(404).send('Record not found.');
//         }

//       // const { timestamp, attempt, callid, company_id } = results[0];
//      const { company_id } = results[0];
    
    
//     const selectedCompany = companyData.find(company => company.cid == company_id);

//     // Fetch the complete recording list from the external API
//     const apiUrl = `https://${selectedCompany.fqdn}/webapi/${selectedCompany.ackey}/query`;
//     const requestBody = {
//         query: "SELECT * FROM public.recordings order by start_time desc;",
//         count: "1000"
//     };

//     try {
//         const response = await axios.post(apiUrl, requestBody, {
//             headers: { 'Content-Type': 'application/json' }
//         });

//         const data = response.data;
//         const recordings = data.result;

//         // Search for the record based on the id provided in the query string
//         const matchedRecord = recordings.find(record => record[2].includes(id));

//         if (!matchedRecord) {
//             return res.status(404).send('No recording found for the given ID.');
//         }

//         // Extract the necessary information from the matched record
//         const timestampUTC = matchedRecord[3];  // This is the start_time in UTC
//         const callid = id;  // This is the callid from the query string

//         // Convert timestamp from UTC to GMT
//         const timestampGMT = new Date(timestampUTC).toISOString().replace('T', ' ').substring(0, 19);
// console.log(timestampGMT);
//         // Format new timestamp as 'YYMMDDHHmmss'
//         const date = new Date(timestampGMT);
//         const formattedTimestamp = [
//             date.getFullYear().toString().slice(2),
//             ('0' + (date.getMonth() + 1)).slice(-2),
//             ('0' + date.getDate()).slice(-2),
//             ('0' + date.getHours()).slice(-2),
//             ('0' + date.getMinutes()).slice(-2),
//             ('0' + date.getSeconds()).slice(-2)
//         ].join('');

//         const recordingUrl = `https://${selectedCompany.fqdn}/webapi/recording/${formattedTimestamp}_${callid}-1-1.mp3`;

//         res.status(200).json({ recordingUrl });

//     } catch (error) {
//         console.error('Error fetching recordings:', error);
//         res.status(500).send('Error fetching recordings.');
//     }
//     });
// });



//const axios = require('axios');

app.get('/format-timestamp', async (req, res) => {
    const { id } = req.query;  // expecting the record ID as a query parameter

    if (!id) {
        return res.status(400).send('Missing required parameter: Call id that means your call is failed.');
    }

    // Fetch company data
    const companyData = await fetchCompanyData();

    const query = 'SELECT company_id FROM call_logs WHERE callid = ?';

    connection.query(query, [id], async (err, results) => {
        if (err) {
            console.error('Error fetching timestamp:', err);
            return res.status(500).send('Error fetching timestamp.');
        }

        if (results.length === 0) {
             const error =`Recording Not Found`;
            return res.status(404).json({error});
        }

        const { company_id } = results[0];
        const selectedCompany = companyData.find(company => company.cid == company_id);

        // Fetch the complete recording list from the external API
        const apiUrl = `https://${selectedCompany.fqdn}/webapi/${selectedCompany.ackey}/query`;
        const requestBody = {
            query: "SELECT * FROM public.recordings order by start_time desc;",
            count: "1000"
        };

        try {
            const response = await axios.post(apiUrl, requestBody, {
                headers: { 'Content-Type': 'application/json' }
            });

            const data = response.data;
            const recordings = data.result;

            // Search for the record based on the id provided in the query string
            const matchedRecord = recordings.find(record => record[2].includes(id));

            if (!matchedRecord) {
                return res.status(404).send('No recording found for the given ID.');
            }

            // Extract the necessary information from the matched record
            const timestampUTC = matchedRecord[3];  // This is the start_time in UTC
            const callid = id;  // This is the callid from the query string

            // Convert timestamp from UTC to GMT+4 (Asia/Dubai)
            const dateUTC = new Date(timestampUTC);
            const timestampDubai = new Date(dateUTC.getTime() + 2 * 60 * 60 * 1000 - 10 * 1000);  // Add 4 hours

            // Format new timestamp as 'YYMMDDHHmmss'
            const formattedTimestamp = [
                timestampDubai.getFullYear().toString().slice(2),
                ('0' + (timestampDubai.getMonth() + 1)).slice(-2),
                ('0' + timestampDubai.getDate()).slice(-2),
                ('0' + timestampDubai.getHours()).slice(-2),
                ('0' + timestampDubai.getMinutes()).slice(-2),
                ('0' + timestampDubai.getSeconds()).slice(-2)
            ].join('');

            const recordingUrl = `https://${selectedCompany.fqdn}/webapi/recording/${formattedTimestamp}_${callid}-1-1.mp3`;
 res.status(200).send(`<audio controls>
 
  <source src="${recordingUrl}" type="audio/mpeg">
Your browser does not support the audio element.
</audio>`);
           // res.status(200).json({ recordingUrl });

        } catch (error) {
            console.error('Error fetching recordings:', error);
            res.status(200).send('Recording is not Availabel');
        }
    });
});



app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
