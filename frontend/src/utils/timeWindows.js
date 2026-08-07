// Splits a group's readings into the current time window and the window
// immediately before it, both anchored to the DATA's own latest
// timestamp -- not real-world "now" -- since uploaded sensor data may not
// be recent. Mirrors the anchor logic already used server-side in
// database.py's get_latest_reading_time / get_readings(hours).
// Place this at src/utils/timeWindows.js

export function splitTimeWindows(rows, hours) {
  const parsed = rows
    .map((row) => ({ ...row, _time: new Date(row.datetime).getTime() }))
    .filter((row) => !Number.isNaN(row._time))
    .sort((a, b) => a._time - b._time)

  if (parsed.length === 0) {
    return { current: [], previous: [] }
  }

  const end = parsed[parsed.length - 1]._time
  const windowMs = hours * 60 * 60 * 1000
  const start = end - windowMs
  const prevStart = start - windowMs

  const current = parsed.filter((row) => row._time >= start && row._time <= end)
  const previous = parsed.filter((row) => row._time >= prevStart && row._time < start)

  return { current, previous }
}