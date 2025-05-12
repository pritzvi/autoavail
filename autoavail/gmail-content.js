// Import config
let BACKEND_API_URL = "http://localhost:3000";
let OPENAI_ENABLED = false; //

function debugLog(message) {
    console.log(`[AutoAvail] ${message}`);
}

// First, load the config
function loadConfig() {
    debugLog("Loading configuration...");
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "getConfig" }, function (response) {
            if (response && response.config) {
                BACKEND_API_URL = response.config.BACKEND_API_URL;
                debugLog(`Loaded BACKEND_API_URL: ${BACKEND_API_URL}`);

                if (response.config.OPENAI_API_KEY) {
                    debugLog("OpenAI API key is configured");
                    OPENAI_ENABLED = true;
                } else {
                    debugLog("OpenAI API key is not configured");
                    OPENAI_ENABLED = false;
                }
            } else {
                debugLog("Failed to load config from background, using default");
                OPENAI_ENABLED = false;
            }
            resolve();
        });
    });
}


async function initialize() {
    debugLog("Initializing AutoAvail Gmail integration");
    await loadConfig();

    document.addEventListener('keyup', handleKeyUp);

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                
                checkForComposeBoxes();
            }
        }
    });

    
    observer.observe(document.body, { childList: true, subtree: true });

    
    checkForComposeBoxes();

    
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        debugLog(`Received message: ${request.action}`);

        if (request.action === 'insertAvailability') {
            const activeElement = document.activeElement;
            if (isInComposeBox(activeElement)) {
                debugLog('Inserting availability via keyboard shortcut');
                insertAvailability(activeElement);
                sendResponse({ success: true });
            } else {
                
                const composeBoxes = findComposeBoxes();
                if (composeBoxes.length > 0) {
                    debugLog(`Found ${composeBoxes.length} compose box(es), inserting into first one`);
                    insertAvailability(composeBoxes[0]);
                    sendResponse({ success: true });
                } else {
                    debugLog('No compose box found for shortcut');
                    sendResponse({ success: false, error: 'No compose box found' });
                }
            }
            return true;
        }
    });
}


function findComposeBoxes() {
    
    let composeBoxes = Array.from(document.querySelectorAll('[role="textbox"][g_editable="true"]'));

    
    if (composeBoxes.length === 0) {
        composeBoxes = Array.from(document.querySelectorAll('[role="textbox"][contenteditable="true"]'));
    }

    
    if (composeBoxes.length === 0) {
        composeBoxes = Array.from(document.querySelectorAll('.editable[contenteditable="true"]'));
    }

    const textareas = Array.from(document.querySelectorAll('textarea')).filter(ta => {
        const form = ta.closest('form');
        return form && form.action && form.action.includes('mail.google.com');
    });

    return [...composeBoxes, ...textareas];
}


function checkForComposeBoxes() {
    const composeBoxes = findComposeBoxes();
    debugLog(`Found ${composeBoxes.length} compose boxes`);

    composeBoxes.forEach(box => {
        
        if (!box.dataset.autoavailProcessed) {
            box.dataset.autoavailProcessed = 'true';
            box.addEventListener('keyup', handleKeyUp);
            debugLog('Attached keyup listener to compose box');
        }
    });
}


function insertAvailability(element) {
    
    if (element.isContentEditable) {
       
        document.execCommand('insertText', false, '{availability}');
    } else {
        
        const start = element.selectionStart;
        const end = element.selectionEnd;
        const text = element.value;
        element.value = text.substring(0, start) + '{availability}' + text.substring(end);
        element.selectionStart = element.selectionEnd = start + '{availability}'.length;
    }

    
    processAvailabilityPlaceholder(element);
}


function processAvailabilityPlaceholder(element) {
    const text = element.innerText || element.value || '';

    if (text.includes('{availability}')) {
        
        chrome.storage.local.get('gcal_token', async function (result) {
            const token = result.gcal_token;
            if (!token) {
                alert('Please authenticate with Google Calendar first via the AutoAvail extension');
                debugLog('No token found');
                return;
            }

            debugLog('Token found, fetching availability...');
            try {
                
                replaceAvailabilityText(element, '{availability}', 'Fetching availability...');

                
                const availabilityText = await generateAvailabilityText(token);
                debugLog('Generated availability text');

                
                if (OPENAI_ENABLED) {
                    debugLog('Using OpenAI to generate email draft');
                    replaceAvailabilityText(element, 'Fetching availability...', 'Generating email with AI...');

                    try {
                        
                        let recipientName = "there"; 
                        const composeContainer = element.closest('div[g_editable="true"], table'); // Find a common ancestor
                        if (composeContainer) {
                            
                            const toFieldSelectors = [
                                'input[name="to"]', 
                                'div[aria-label="To"] span[email]', 
                                'span[email]' 
                            ];
                            for (const selector of toFieldSelectors) {
                                const toElements = composeContainer.querySelectorAll(selector);
                                if (toElements.length > 0) {
                                   
                                    const firstRecipient = toElements[0];
                                    recipientName = firstRecipient.getAttribute('name') || firstRecipient.getAttribute('email') || firstRecipient.textContent || "there";
                                   
                                    recipientName = recipientName.split('<')[0].trim().split(' ')[0]; 
                                    if (recipientName.includes('@')) recipientName = "name"; 
                                    debugLog(`Found recipient: ${recipientName}`);
                                    break; // 
                                }
                            }
                        } else {
                            debugLog("Could not find compose container to search for recipient.");
                        }

                        
                        chrome.runtime.sendMessage(
                            { action: 'generateEmail', availabilityText, recipientName }, 
                            function (response) {
                                if (chrome.runtime.lastError) {
                                    debugLog(`Error: ${chrome.runtime.lastError.message}`);
                                    replaceAvailabilityText(element, 'Generating email with AI...',
                                        formatErrorResponse(availabilityText, chrome.runtime.lastError.message));
                                    return;
                                }

                                if (response && response.success) {
                                    debugLog('Successfully generated email with OpenAI');
                                    let finalText = response.emailText;

                                    if (response.error) {
                                        finalText += `\n\n(${response.error})`;
                                        debugLog(response.error);
                                    }

                                    replaceAvailabilityText(element, 'Generating email with AI...', finalText);
                                } else {
                                    debugLog(`Error generating email: ${response?.error || 'Unknown error'}`);
                                    
                                    replaceAvailabilityText(element, 'Generating email with AI...',
                                        formatErrorResponse(availabilityText, response?.error || 'Unknown error'));
                                }
                            }
                        );
                    } catch (error) {
                        debugLog(`Error sending message to background script: ${error.message}`);
                        replaceAvailabilityText(element, 'Generating email with AI...',
                            formatErrorResponse(availabilityText, error.message));
                    }
                } else {
                    replaceAvailabilityText(element, 'Fetching availability...', availabilityText);
                    debugLog('Replaced text in compose window with raw availability (OpenAI disabled)');
                }
            } catch (error) {
                console.error('Error fetching availability:', error);
                debugLog(`Error: ${error.message}`);
                replaceAvailabilityText(element, 'Fetching availability...',
                    'Error fetching availability. Please try again or check the extension.');
            }
        });
    }
}


function formatErrorResponse(availabilityText, errorMessage) {
    
    let cleanAvailability = availabilityText;

   
    if (cleanAvailability.startsWith("Here's my availability for the next week:")) {
        cleanAvailability = cleanAvailability.replace("Here's my availability for the next week:", "");
    }

   
    const lines = cleanAvailability.split('\n').filter(line => line.trim());
    let formatted = "I'm available on the following days and times:\n\n";

    lines.forEach(line => {
        if (line.includes(':')) {
            formatted += line.trim() + "\n";
        }
    });

    return formatted;
}


async function handleKeyUp(event) {
    
    const element = event.target;

   
    if (!isInComposeBox(element)) return;

    const text = element.innerText || element.value || '';

    if (![' ', 'Enter', '.', ',', ';', ':', '!', '?'].includes(event.key)) return;

    debugLog(`Keyup in compose box, checking for {availability} in: ${text.substring(0, 50)}...`);

    
    if (text.includes('{availability}')) {
        debugLog('Found {availability} trigger!');
        processAvailabilityPlaceholder(element);
    }
}

function isInComposeBox(element) {
    if (!element) return false;

    if (element.getAttribute('role') === 'textbox' &&
        (element.getAttribute('g_editable') === 'true' || element.getAttribute('contenteditable') === 'true')) {
        return true;
    }

    if (element.isContentEditable) {
        if (window.location.hostname === 'mail.google.com' || document.title.includes('Gmail')) {
            return true;
        }

        
        if (element.classList.contains('compose-box')) {
            return true;
        }
    }

    if (element.tagName === 'TEXTAREA') {
        const form = element.closest('form');
        return form && form.action && form.action.includes('mail.google.com');
    }

    return false;
}

function replaceAvailabilityText(element, oldText, newText) {
    debugLog(`Replacing "${oldText}" with formatted availability text`);

    if (element.isContentEditable) {
        const currentHTML = element.innerHTML;
        if (currentHTML.includes(oldText)) {
            element.innerHTML = currentHTML.replace(oldText, newText);
            debugLog('Replaced text in contentEditable element (HTML)');
            return;
        }

        const currentText = element.innerText;
        if (currentText.includes(oldText)) {
            try {
                const range = document.createRange();
                const sel = window.getSelection();

                const savedSelection = saveSelection();
                const textNodes = [];
                getTextNodes(element, textNodes);

                let found = false;
                for (const node of textNodes) {
                    const index = node.textContent.indexOf(oldText);
                    if (index >= 0) {
                        range.setStart(node, index);
                        range.setEnd(node, index + oldText.length);
                        range.deleteContents();
                        range.insertNode(document.createTextNode(newText));
                        found = true;
                        break;
                    }
                }

                
                if (found) {
                    debugLog('Used range selection to replace text');
                    restoreSelection(savedSelection);
                    return;
                }
            } catch (e) {
                debugLog(`Range replacement failed: ${e.message}`);
            }

            
            try {
                
                element.focus();

                
                const selection = window.getSelection();
                selection.selectAllChildren(element);
                selection.collapseToStart();

                
                const findResult = window.find(oldText, false, false, true);

                if (findResult) {
                    
                    document.execCommand('insertText', false, newText);
                    debugLog('Used document.execCommand to replace text');
                    return;
                }
            } catch (e) {
                debugLog(`execCommand replacement failed: ${e.message}`);
            }

            
            debugLog('Using fallback full content replacement');
            element.innerHTML = currentHTML.replace(oldText, newText);
        }
    } else {
        
        element.value = element.value.replace(oldText, newText);
        debugLog('Replaced text in textarea element');
    }
}


function getTextNodes(node, textNodes) {
    if (node.nodeType === 3) { 
        textNodes.push(node);
    } else {
        for (let i = 0; i < node.childNodes.length; i++) {
            getTextNodes(node.childNodes[i], textNodes);
        }
    }
}


function saveSelection() {
    if (window.getSelection) {
        const sel = window.getSelection();
        if (sel.getRangeAt && sel.rangeCount) {
            return sel.getRangeAt(0);
        }
    }
    return null;
}


function restoreSelection(range) {
    if (range && window.getSelection) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}


async function generateAvailabilityText(token) {
    debugLog(`Fetching calendar data from ${BACKEND_API_URL}/api/calendar/events`);

    const response = await fetch(`${BACKEND_API_URL}/api/calendar/events`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        debugLog(`API error: ${response.status} - ${errorText}`);
        throw new Error(`Failed to fetch calendar data: ${response.status}`);
    }

    const data = await response.json();
    debugLog('Successfully fetched calendar data');

    
    return formatAvailabilityForEmail(data);
}


function formatAvailabilityForEmail(calendarData) {
    if (!calendarData.items) {
        debugLog('No calendar items found');
        return "I don't have any events scheduled for the next week, so I'm generally available.";
    }

    debugLog(`Formatting ${calendarData.items.length} calendar events`);

    
    const days = {};
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + 7);

    calendarData.items.forEach(event => {
        if (!event.start.dateTime || !event.end.dateTime) return;
        const day = new Date(event.start.dateTime).toDateString();
        if (!days[day]) days[day] = [];
        days[day].push(event);
    });

    
    let availabilityText = "Here's my availability for the next week:\n\n";

    for (let d = new Date(now); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dayStr = d.toDateString();
        const dayName = dayStr.split(' ')[0];
        const dayDate = `${d.getMonth() + 1}/${d.getDate()}`;

        const workStart = new Date(d); workStart.setHours(9, 0, 0, 0);
        const workEnd = new Date(d); workEnd.setHours(17, 0, 0, 0);

        const dayEvents = days[dayStr] || [];
        const freeSlots = getFreeSlots(dayEvents, workStart, workEnd);

        availabilityText += `${dayName} ${dayDate}: `;

        if (freeSlots.length) {
            
            const groupedSlots = groupConsecutiveSlots(freeSlots);
            availabilityText += groupedSlots.join(', ');
        } else {
            availabilityText += "Fully booked";
        }

        availabilityText += "\n";
    }

    debugLog('Completed formatting availability text');
    return availabilityText;
}


function groupConsecutiveSlots(slots) {
    if (!slots.length) return [];

    const result = [];
    let currentGroup = {
        start: slots[0].split(' - ')[0],
        end: slots[0].split(' - ')[1]
    };

    for (let i = 1; i < slots.length; i++) {
        const currentSlot = slots[i];
        const [start, end] = currentSlot.split(' - ');

        if (start === currentGroup.end) {
            
            currentGroup.end = end;
        } else {
            
            result.push(`${currentGroup.start} - ${currentGroup.end}`);
            currentGroup = { start, end };
        }
    }

    
    result.push(`${currentGroup.start} - ${currentGroup.end}`);

    return result;
}


function getFreeSlots(events, dayStart, dayEnd) {
    
    const slots = [];
    const slotDuration = 30 * 60 * 1000; 
    let current = new Date(dayStart);
    const end = new Date(dayEnd);

    
    const sortedEvents = events.slice().sort((a, b) =>
        new Date(a.start.dateTime) - new Date(b.start.dateTime)
    );

    for (let i = 0; current < end; i++) {
        const slotStart = new Date(current);
        const slotEnd = new Date(current.getTime() + slotDuration);
        if (slotEnd > end) break;

        
        const overlaps = sortedEvents.some(event => {
            const eventStart = new Date(event.start.dateTime);
            const eventEnd = new Date(event.end.dateTime);
            return (
                (slotStart < eventEnd) && (slotEnd > eventStart)
            );
        });
        if (!overlaps) {
            slots.push(`${slotStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${slotEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        }
        current = slotEnd;
    }
    return slots;
}

// Start the initialization when the page is loaded
window.addEventListener('load', initialize); 