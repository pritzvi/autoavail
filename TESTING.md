# AutoAvail Testing Report

## Testing Approach

Testing for the AutoAvail Chrome extension was conducted manually due to the interactive nature of its features, which involve user authentication via OAuth, interaction with the Google Calendar API through a backend, direct manipulation of the Gmail compose window DOM, and reliance on user-specific preferences stored locally. Manual testing allowed for simulating real-world user flows and verifying the integration between the extension UI, background processes, content scripts, and external APIs. Each member of our team cloned the repo from scratch and tested it manually to catch common errors such as forgetting to set OAuth token, missing credits in OpenAI account, etc.

## Interface Testing (Manual)

### Test Case 1: Initial Setup and Basic Availability Display

*   **Inputs:**
    1.  User installs the extension.
    2.  User clicks "Connect with Google" in the popup.
    3.  User completes Google OAuth flow in the new tab.
    4.  User copies the access token displayed on the success page.
    5.  User pastes the token into the extension popup and clicks "Save Token".
*   **Expected Outputs:**
    1.  OAuth flow completes successfully.
    2.  Access token is saved in `chrome.storage.local`.
    3.  Popup displays availability for the next 7 days based on the user's Google Calendar, using default preferences (9am-5pm work day, 30-min slots, 2am-7am DND).
    4.  No errors in the background or popup console related to fetching events.
*   **Actual Behavior:**
    *   The flow works as expected. Availability is displayed correctly using default settings.
*   **Debugging/Refactoring Notes:**
    *   Initially encountered a "Failed to fetch" error when clicking "Connect with Google", which was resolved by ensuring the backend server was running and the extension manifest had correct `host_permissions` for `http://localhost:3000`.

### Test Case 2: Custom Preferences Application

*   **Inputs:**
    1.  User navigates to the extension's options page (`options.html`).
    2.  User sets Work-day start to "10:00", Work-day end to "16:00", Slot length to "30" minutes, and Do Not Book window from "12:00" to "13:00".
    3.  User clicks "Save".
    4.  User opens the extension popup.
*   **Expected Outputs:**
    1.  A "Preferences saved!" message appears briefly on the options page.
    2.  Preferences are saved correctly in `chrome.storage.local`.
    3.  The popup displays availability slots only between 10:00 AM and 4:00 PM.
    4.  Displayed slots are 30 minutes long.
    5.  No slots are shown between 12:00 PM and 1:00 PM.
*   **Actual Behavior:**
    *   The flow works as expected. Preferences are applied correctly to the popup availability display.


### Test Case 3: Gmail Integration - Raw Availability (No AI)

*   **Inputs:**
    1.  User has authenticated and saved the token.
    2.  User has *not* entered an OpenAI API key (or it's invalid/cleared).
    3.  User opens a Gmail compose window.
    4.  User types `{availability}` followed by a space.
    5.  User has custom preferences set (e.g., 10am-4pm work day, 12pm-1pm DND, 15-min slots).
*   **Expected Outputs:**
    1.  The text `{availability}` is replaced in the compose window.
    2.  The replacement text is the formatted availability for the next 7 days.
    3.  The availability times respect the user's saved preferences (10am-4pm, no 12pm-1pm slots, 15-min increments if applicable, grouped).
    4.  A debug log `Replaced text in compose window with raw availability (OpenAI disabled)` appears in the Gmail console.
*   **Actual Behavior:**
    *   The flow works as expected. Raw availability reflecting user preferences is inserted.
*   **Debugging/Refactoring Notes:**
    *   An initial discrepancy where the email draft used hardcoded 9am-5pm times while the popup used preferences was fixed by updating `gmail-content.js` to load and use preferences from `chrome.storage.local` when generating the availability text. This was fixed by identifying an error with saving OpenAI API credentials.

### Test Case 4: Options Page Reset

*   **Inputs:**
    1.  User has custom preferences saved.
    2.  User navigates to the options page.
    3.  User clicks "Reset to defaults".
*   **Expected Outputs:**
    1.  The options page reloads.
    2.  All input fields on the options page show the default values (9-5, 2-7 DND, 30 min slot).
    3.  `chrome.storage.local` is updated with the default values.
    4.  Opening the popup now shows availability based on the default settings.
*   **Actual Behavior:**
    *   The flow works as expected. Preferences are reset correctly.
*   **Debugging/Refactoring Notes:**
    *   None for this specific flow, functionality was straightforward.

## Prompt Testing

### Prompt Engineering and Evolution

Initial testing revealed that simply asking the LLM to "write an email with this availability" often led to inconsistent results. The model (`gpt-3.5-turbo`) sometimes failed to capture the desired professional yet friendly tone, incorrectly formatted the availability list, or omitted key elements like greetings or closings. 

**Failed Prompt Example:**
```
Write an email to ${recipientName} including this availability:
${availabilityText}
```
*Potential Issues:* Output might be too blunt, lack a greeting/closing, or reformat the times incorrectly. LLM makes up recipient name if not given (Hi John Doe, for example).

To address this, the prompt was refined using in-context learning and more specific instructions. The final prompt provides clear examples of the desired output format and explicitly instructs the model on tone, required elements (greeting, intro, exact times, closing), and constraints (avoid robotic language).

**Final Prompt Used (from `background.js`):**
```
Generate a friendly, professional email sharing availability. The email should be conversational and natural, like a real person writing it. Here are some example formats:

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

${availabilityText}
```
This structured prompt, combined with the system message reinforcing the assistant's persona, significantly improved the consistency and quality of the generated emails.

### Test Case 1: Successful AI Email Generation (Standard Availability)

*   **Model:** `gpt-3.5-turbo`
*   **Inputs:**
    1.  Valid OpenAI API key saved.
    2.  User types `{availability}` in Gmail to "Jane Doe <jane@example.com>".
    3.  Raw availability: `Mon 8/12: 10:00 AM - 12:00 PM, 01:00 PM - 04:00 PM\nTue 8/13: 11:00 AM - 03:00 PM\nWed 8/14: Fully booked`
*   **Expected Outputs:**
    1.  A friendly, professional email is generated.
    2.  Greeting addresses "Jane".
    3.  Availability for Monday and Tuesday is listed accurately.
    4.  Wednesday is noted as "Fully booked" or similar phrasing integrated naturally.
    5.  Includes a suitable closing line and salutation.
    6.  Example snippet: "...Here are the times I have available:\nMon 8/12: 10:00 AM - 12:00 PM, 01:00 PM - 04:00 PM\nTue 8/13: 11:00 AM - 03:00 PM\nLooks like Wednesday is fully booked for me... Let me know what works!\nBest regards,..."
*   **Current Behavior:**
    *   Works as expected. The model follows the format and tone instructions.
*   **Debugging/Refactoring Notes:**
    *   Recipient name extraction logic was added to personalize the greeting.

### Test Case 2: AI Failure (API Key Missing or Invalid)

*   **Model:** `gpt-3.5-turbo` (attempted call)
*   **Inputs:**
    1.  No/invalid OpenAI API key saved.
    2.  User types `{availability}` in Gmail.
    3.  Raw availability generated (e.g., `Mon 8/12: ...`).
*   **Expected Outputs:**
    1.  Background script detects missing key or API call fails.
    2.  Content script receives error or no AI text.
    3.  `{availability}` is replaced with formatted *raw* availability.
    4.  Console logs indicate fallback (`Replaced text... (OpenAI disabled)` or API error). Popup may show AI disabled.
*   **Current Behavior:**
    *   Works as expected. Fallback to raw, formatted availability occurs gracefully.
*   **Debugging/Refactoring Notes:**
    *   Fallback mechanism (`formatAvailabilityFallback`) and error handling in message passing were added to ensure functionality even without AI. Debug logs were crucial for differentiating frontend state vs. background state regarding the API key.

### Test Case 3: AI Generation with Sparse Availability

*   **Model:** `gpt-3.5-turbo`
*   **Inputs:**
    1.  Valid OpenAI API key saved.
    2.  User types `{availability}` in Gmail to "Mark".
    3.  Raw availability: `Mon 8/12: Fully booked\nTue 8/13: 02:00 PM - 02:30 PM\nWed 8/14: Fully booked\nThu 8/15: 09:00 AM - 09:30 AM\nFri 8/16: Fully booked`
*   **Expected Outputs:**
    1.  A friendly email is generated.
    2.  The email naturally integrates the very limited availability.
    3.  It should clearly state the specific slots on Tuesday and Thursday.
*   **Current Behavior:**
    *   Works as expected. The model adapts the surrounding text to fit the sparse availability while still listing the times accurately.
*   **Debugging/Refactoring Notes:**
    *   No specific refactoring needed for this case, as the detailed prompt guides the model sufficiently.

