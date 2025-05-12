const config = {
    BACKEND_API_URL: "http://localhost:3000",
    OPENAI_API_KEY: "" 
};

function debugLog(message) {
    console.log(`[AutoAvail Background] ${message}`);
}

debugLog("Background script initializing");


chrome.storage.local.get('openai_api_key', function (result) {
    if (result.openai_api_key) {
        config.OPENAI_API_KEY = result.openai_api_key;
        debugLog("Loaded OpenAI API key from storage");
    }
});

fetch(chrome.runtime.getURL('config.js'))
    .then(response => response.text())
    .then(text => {
        try {
            const backendUrlMatch = text.match(/BACKEND_API_URL:\s*"([^"]+)"/);
            if (backendUrlMatch && backendUrlMatch[1]) {
                config.BACKEND_API_URL = backendUrlMatch[1];
                debugLog(`Loaded BACKEND_API_URL: ${config.BACKEND_API_URL}`);
            }

            if (!config.OPENAI_API_KEY) {
                const openaiKeyMatch = text.match(/OPENAI_API_KEY:\s*"([^"]+)"/);
                if (openaiKeyMatch && openaiKeyMatch[1]) {
                    config.OPENAI_API_KEY = openaiKeyMatch[1];
                    debugLog("Loaded OPENAI_API_KEY from config");
                }
            }
        } catch (error) {
            console.error('Error parsing config.js:', error);
        }
    })
    .catch(error => {
        console.error('Error loading config.js:', error);
    });

async function generateEmailWithOpenAI(availabilityText, recipientName = "there") {
    debugLog(`Generating email with OpenAI for recipient: ${recipientName}`);
    debugLog(`Received availability text for OpenAI: \\n${availabilityText}`);

    if (!config.OPENAI_API_KEY) {
        throw new Error("OpenAI API key not set. Please add it in the extension settings.");
    }

    try {
        const prompt = `Generate a friendly, professional email sharing availability. The email should be conversational and natural, like a real person writing it. Here are some example formats:

Example 1:
Dear John,

I'd be happy to meet with you. Here's my availability:

Mon 5/12: 09:00 AM - 05:00 PM
Tue 5/13: 09:00 AM - 05:00 PM
Wed 5/14: 09:00 AM - 05:00 PM

Example 2:
Hi Sarah,

I've checked my calendar, and I'm available at these times:

Mon 5/12: 09:00 AM - 05:00 PM
Tue 5/13: 09:00 AM - 05:00 PM
Wed 5/14: 09:00 AM - 05:00 PM

Please add a closing line like "Let me know what works for you!" or "Let me know if you'd like to schedule a time." and a salutation like sincerely or best regards.

Please use a natural, conversational tone while including all the availability times exactly as provided below:

${availabilityText}`;

        debugLog("Sending request to OpenAI API...");
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are an email assistant that generates natural, conversational availability responses. You should:\n1. Start with a friendly greeting using the recipient's name\n2. Write in a natural, conversational tone\n3. Include a brief, friendly introduction\n4. List the availability times exactly as provided\n5. Keep the overall tone professional but warm\n6. Avoid overly formal or robotic language"
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            debugLog(`OpenAI API error response: ${JSON.stringify(errorData)}`);
            throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        debugLog("Successfully generated email with OpenAI");
        debugLog(`OpenAI API response: ${JSON.stringify(data)}`);

        if (data.choices && data.choices.length > 0) {
            const generatedText = data.choices[0].message.content.trim();
            debugLog(`Generated text: ${generatedText}`);
            return generatedText;
        } else {
            throw new Error("Unexpected response format from OpenAI API");
        }
    } catch (error) {
        debugLog(`Error generating email: ${error.message}`);
        throw error;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    debugLog(`Received message: ${request.action}`);

    if (request.action === 'getConfig') {
        debugLog(`Sending config: ${JSON.stringify({ ...config, OPENAI_API_KEY: config.OPENAI_API_KEY ? "[SET]" : "[NOT SET]" })}`);
        sendResponse({ config });
        return true; 
    }
    else if (request.action === 'generateEmail') {
        debugLog(`Generating email for availability`);
        
        generateEmailWithOpenAI(request.availabilityText, request.recipientName)
            .then(emailText => {
                debugLog("Email generated successfully");
                sendResponse({ success: true, emailText });
            })
            .catch(error => {
                debugLog(`Error generating email: ${error.message}`);
                
                const formattedAvailability = formatAvailabilityFallback(request.availabilityText);
                sendResponse({
                    success: true,
                    emailText: formattedAvailability,
                    error: `Note: Could not use AI due to API errors. Showing formatted availability instead.`
                });
            });
        return true; 
    }
    else if (request.action === 'updateOpenAIKey') {
        debugLog(`Updating OpenAI API key`);
        config.OPENAI_API_KEY = request.apiKey || "";

       
        sendResponse({
            success: true,
            hasKey: !!config.OPENAI_API_KEY
        });
        return true;
    }
    else {
        debugLog(`Unknown message action: ${request.action}`);
        sendResponse({ error: 'Unknown action' });
        return true;
    }
});


function formatAvailabilityFallback(availabilityText) {
    let formatted = availabilityText.replace("Here's my availability for the next week:", "");

    // Split by lines and clean up
    const lines = formatted.split('\\n').filter(line => line.trim());

    // Create a better formatted message
    let result = "I'm available on the following days and times:\\n\\n";

    lines.forEach(line => {
        if (line.includes(':')) {
            result += line.trim() + "\\n";
        }
    });

    return result;
}

chrome.runtime.onInstalled.addListener((details) => {
    debugLog(`Extension ${details.reason}: ${details.reason}`);

    if (details.reason === 'install' || details.reason === 'update') {
        chrome.tabs.query({ url: '*://mail.google.com/*' }, (tabs) => {
            debugLog(`Found ${tabs.length} Gmail tabs to refresh`);
            tabs.forEach(tab => {
                chrome.tabs.reload(tab.id);
            });
        });
    }
}); 