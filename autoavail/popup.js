// Import config
const BACKEND_API_URL = window.config.BACKEND_API_URL;

function getFreeSlots(events, dayStart, dayEnd, prefs) {
  // events: array of {start: {dateTime}, end: {dateTime}}
  // dayStart, dayEnd: Date objects for the workday
  const slots = [];
  const slotDuration = prefs.slot_minutes * 60 * 1000;
  let current = new Date(dayStart);
  const end = new Date(dayEnd);

  // Sort events by start time
  const sortedEvents = events.slice().sort((a, b) =>
    new Date(a.start.dateTime) - new Date(b.start.dateTime)
  );

  // Parse do-not-book window
  const [uaH1, uaM1] = prefs.unavail_start.split(":").map(Number);
  const [uaH2, uaM2] = prefs.unavail_end.split(":").map(Number);

  for (let i = 0; current < end; i++) {
    const slotStart = new Date(current);
    const slotEnd = new Date(current.getTime() + slotDuration);
    if (slotEnd > end) break;

    // Calculate do-not-book window for this day
    const unavailStart = new Date(slotStart); unavailStart.setHours(uaH1, uaM1, 0, 0);
    const unavailEnd   = new Date(slotStart); unavailEnd.setHours(uaH2, uaM2, 0, 0);

    // If do-not-book window crosses midnight, handle that
    let overlapsDoNotBook = false;
    if (unavailEnd > unavailStart) {
      // Normal case: same day
      overlapsDoNotBook = slotEnd > unavailStart && slotStart < unavailEnd;
    } else {
      // Crosses midnight: e.g., 22:00-06:00
      // Slot overlaps if it overlaps either [unavailStart, 23:59:59] or [00:00, unavailEnd]
      const dayEnd = new Date(slotStart); dayEnd.setHours(23,59,59,999);
      const nextDay = new Date(slotStart); nextDay.setDate(nextDay.getDate() + 1); nextDay.setHours(0,0,0,0);
      overlapsDoNotBook =
        (slotEnd > unavailStart && slotStart < dayEnd) ||
        (slotEnd > nextDay && slotStart < unavailEnd);
    }
    if (overlapsDoNotBook) {
      current = slotEnd;
      continue;
    }
    // Check if this slot overlaps with any event
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

function fetchAndDisplayAvailability(token, prefs) {
  const eventsList = document.getElementById('events');
  eventsList.innerHTML = '<li>Loading availability...</li>';
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(now.getDate() + 7);

  fetch(`${BACKEND_API_URL}/api/calendar/events`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
    .then(res => res.json())
    .then(data => {
      eventsList.innerHTML = '';
      if (!data.items) {
        eventsList.innerHTML = '<li>No events found.</li>';
        return;
      }
      // Group events by day
      const days = {};
      data.items.forEach(event => {
        if (!event.start.dateTime || !event.end.dateTime) return;
        const day = new Date(event.start.dateTime).toDateString();
        if (!days[day]) days[day] = [];
        days[day].push(event);
      });
      // For each day from today to +7 days, show free slots
      for (let d = new Date(now); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dayStr = d.toDateString();
        const workStart = new Date(d);
        const [wsH, wsM] = prefs.work_start.split(":");
        workStart.setHours(wsH, wsM, 0, 0);

        const workEnd = new Date(d);
        const [weH, weM] = prefs.work_end.split(":");
        workEnd.setHours(weH, weM, 0, 0);
        const dayEvents = days[dayStr] || [];
        const freeSlots = getFreeSlots(dayEvents, workStart, workEnd, prefs);
        const li = document.createElement('li');
        li.innerHTML = `<b>${dayStr}</b><br>` + (freeSlots.length ? freeSlots.join('<br>') : '<i>No availability</i>');
        eventsList.appendChild(li);
      }
    })
    .catch(() => {
      eventsList.innerHTML = '<li>Invalid or expired token. Please paste a valid access token above.</li>';
    });
}

document.addEventListener('DOMContentLoaded', function () {
  const connectBtn = document.getElementById('connect-google');
  const saveTokenBtn = document.getElementById('save-token');
  const accessTokenInput = document.getElementById('access-token');

  connectBtn.addEventListener('click', function () {
    fetch(`${BACKEND_API_URL}/api/auth/url`)
      .then(res => res.json())
      .then(data => {
        window.open(data.url, '_blank');
      });
  });

  saveTokenBtn.addEventListener('click', function () {
    const token = accessTokenInput.value.trim();
    if (token) {
      chrome.storage.local.set({ gcal_token: token }, function() {
        // Always reload preferences before displaying availability
        chrome.storage.local.get(
          ["unavail_start", "unavail_end", "work_start", "work_end", "slot_minutes"],
          function (prefs) {
            fetchAndDisplayAvailability(token, {
              unavail_start : prefs.unavail_start || "02:00",
              unavail_end   : prefs.unavail_end   || "07:00",
              work_start    : prefs.work_start    || "09:00",
              work_end      : prefs.work_end      || "17:00",
              slot_minutes  : prefs.slot_minutes  || 30
            });
          }
        );
      });
    }
  });

  // On load, try to get token from storage and fetch events
  chrome.storage.local.get(
    ["gcal_token", "unavail_start", "unavail_end",
     "work_start",  "work_end", "slot_minutes"],
    function (result) {
      const token = result.gcal_token;
      const prefs = {
        unavail_start : result.unavail_start || "02:00",
        unavail_end   : result.unavail_end   || "07:00",
        work_start    : result.work_start    || "09:00",
        work_end      : result.work_end      || "17:00",
        slot_minutes  : result.slot_minutes  || 30
      };
      if (token) {
        accessTokenInput.value = token;
        fetchAndDisplayAvailability(token, prefs);
      }
    }
  );

  // Settings button handler
  const openSettingsBtn = document.getElementById('open-settings');
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', function() {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open('options.html');
      }
    });
  }

  // Additional setup for OpenAI integration
  const saveOpenAIKeyBtn = document.getElementById('save-openai-key');
  const openaiKeyInput = document.getElementById('openai-key');
  const openaiStatus = document.getElementById('openai-status');

  // Load saved OpenAI API key
  chrome.storage.local.get('openai_api_key', function (result) {
    if (result.openai_api_key) {
      openaiKeyInput.value = result.openai_api_key;
      openaiStatus.textContent = "AI email generation is enabled";
      openaiStatus.className = "ai-status success";
    }
  });

  // Save OpenAI API key
  if (saveOpenAIKeyBtn) {
    saveOpenAIKeyBtn.addEventListener('click', function () {
      const apiKey = openaiKeyInput.value.trim();

      if (apiKey) {
        chrome.storage.local.set({ openai_api_key: apiKey }, function () {
          // Notify background script
          chrome.runtime.sendMessage({
            action: 'updateOpenAIKey',
            apiKey: apiKey
          }, function (response) {
            if (response && response.success) {
              openaiStatus.textContent = "AI email generation is enabled";
              openaiStatus.className = "ai-status success";
            } else {
              openaiStatus.textContent = "Failed to update API key";
              openaiStatus.className = "ai-status error";
            }
          });
        });
      } else {
        // Clear the API key
        chrome.storage.local.remove('openai_api_key', function () {
          // Notify background script
          chrome.runtime.sendMessage({
            action: 'updateOpenAIKey',
            apiKey: ""
          }, function (response) {
            openaiStatus.textContent = "AI email generation is disabled";
            openaiStatus.className = "ai-status error";
          });
        });
      }
    });
  }
}); 