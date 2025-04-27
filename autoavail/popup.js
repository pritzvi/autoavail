const { BACKEND_API_URL } = window.AUTOAVAIL_CONFIG;

function getFreeSlots(events, dayStart, dayEnd) {
  // events: array of {start: {dateTime}, end: {dateTime}}
  // dayStart, dayEnd: Date objects for the workday
  const slots = [];
  const slotDuration = 30 * 60 * 1000; // 30 minutes in ms
  let current = new Date(dayStart);
  const end = new Date(dayEnd);

  // Sort events by start time
  const sortedEvents = events.slice().sort((a, b) =>
    new Date(a.start.dateTime) - new Date(b.start.dateTime)
  );

  for (let i = 0; current < end; i++) {
    const slotStart = new Date(current);
    const slotEnd = new Date(current.getTime() + slotDuration);
    if (slotEnd > end) break;

    // Check if this slot overlaps with any event
    const overlaps = sortedEvents.some(event => {
      const eventStart = new Date(event.start.dateTime);
      const eventEnd = new Date(event.end.dateTime);
      return (
        (slotStart < eventEnd) && (slotEnd > eventStart)
      );
    });
    if (!overlaps) {
      slots.push(`${slotStart.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${slotEnd.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`);
    }
    current = slotEnd;
  }
  return slots;
}

function fetchAndDisplayAvailability(token) {
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
        const workStart = new Date(d); workStart.setHours(9,0,0,0);
        const workEnd = new Date(d); workEnd.setHours(17,0,0,0);
        const dayEvents = days[dayStr] || [];
        const freeSlots = getFreeSlots(dayEvents, workStart, workEnd);
        const li = document.createElement('li');
        li.innerHTML = `<b>${dayStr}</b><br>` + (freeSlots.length ? freeSlots.join('<br>') : '<i>No availability</i>');
        eventsList.appendChild(li);
      }
    })
    .catch(() => {
      eventsList.innerHTML = '<li>Invalid or expired token. Please paste a valid access token above.</li>';
    });
}

document.addEventListener('DOMContentLoaded', function() {
  const connectBtn = document.getElementById('connect-google');
  const saveTokenBtn = document.getElementById('save-token');
  const accessTokenInput = document.getElementById('access-token');

  connectBtn.addEventListener('click', function() {
    fetch(`${BACKEND_API_URL}/api/auth/url`)
      .then(res => res.json())
      .then(data => {
        window.open(data.url, '_blank');
      });
  });

  saveTokenBtn.addEventListener('click', function() {
    const token = accessTokenInput.value.trim();
    if (token) {
      chrome.storage.local.set({ gcal_token: token }, function() {
        fetchAndDisplayAvailability(token);
      });
    }
  });

  // On load, try to get token from storage and fetch events
  chrome.storage.local.get('gcal_token', function(result) {
    const token = result.gcal_token;
    if (token) {
      accessTokenInput.value = token;
      fetchAndDisplayAvailability(token);
    }
  });
}); 