const $ = (id) => document.getElementById(id);


const D = {
  unavail_start : "02:00",
  unavail_end   : "07:00",
  work_start    : "09:00",
  work_end      : "17:00",
  slot_minutes  : 30
};


document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(D, (s) => {
    $("#unavail-start").value = s.unavail_start;
    $("#unavail-end").value   = s.unavail_end;
    $("#work-start").value    = s.work_start;
    $("#work-end").value      = s.work_end;
    $("#slot-min").value      = s.slot_minutes;
  });
});


$("#save").addEventListener("click", () => {
  const prefs = {
    unavail_start : $("#unavail-start").value || D.unavail_start,
    unavail_end   : $("#unavail-end").value   || D.unavail_end,
    work_start    : $("#work-start").value    || D.work_start,
    work_end      : $("#work-end").value      || D.work_end,
    slot_minutes  : parseInt($("#slot-min").value, 10) || D.slot_minutes
  };
  chrome.storage.local.set(prefs, () => alert("Saved!"));
});

$("#reset").addEventListener("click", () => {
  chrome.storage.local.set(D, () => location.reload());
});
