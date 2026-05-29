export interface Shift {
  name: string;
  start: number; // in minutes from midnight
  end: number;   // in minutes from midnight
  overnight: boolean;
}

export const SHIFTS: Shift[] = [
  { name: 'Morning 6am-2pm', start: 360, end: 840, overnight: false }, // 06:00 AM - 02:00 PM
  { name: 'Regular 8am-5pm', start: 480, end: 1020, overnight: false }, // 08:00 AM - 05:00 PM
  { name: 'Afternoon 2pm-10pm', start: 840, end: 1320, overnight: false }, // 02:00 PM - 10:00 PM
  { name: 'Night 10pm-6am', start: 1320, end: 360, overnight: true },   // 10:00 PM - 06:00 AM
];

// Helper to convert date-time or HH:MM string to minutes-from-midnight
export function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length < 2) return 0;
  const hrs = parseInt(parts[0], 10);
  const mins = parseInt(parts[1], 10);
  return (hrs * 60) + mins;
}

// Format minutes from midnight to HH:MM AM/PM
export function formatMinutes(mins: number): string {
  const normMins = (mins + 1440) % 1440;
  const h = Math.floor(normMins / 60);
  const m = normMins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = m < 10 ? `0${m}` : m;
  return `${displayH}:${displayM} ${ampm}`;
}

export function findClosestShift(clockInTimeStr: string): Shift {
  const clockedInMins = timeToMinutes(clockInTimeStr);

  let closestShift = SHIFTS[0];
  let minDiff = Infinity;

  for (const shift of SHIFTS) {
    let diff = Math.abs(clockedInMins - shift.start);
    if (diff > 720) {
      diff = 1440 - diff;
    }
    if (diff < minDiff) {
      minDiff = diff;
      closestShift = shift;
    }
  }

  return closestShift;
}

export function calculateTardiness(clockInTimeStr: string, shift: Shift): number {
  const clockedInMins = timeToMinutes(clockInTimeStr);
  const shiftStart = shift.start;

  if (!shift.overnight) {
    if (clockedInMins > shiftStart && clockedInMins < shift.end) {
      return clockedInMins - shiftStart;
    }
    return 0;
  } else {
    // Night Shift (e.g., 22:00 / 1320 to 06:00 / 360)
    // If they clocked in before midnight (e.g. 23:00 / 1380)
    if (clockedInMins >= shiftStart && clockedInMins < 1440) {
      return clockedInMins - shiftStart;
    }
    // If they clocked in after midnight but before standard morning shift threshold (360)
    if (clockedInMins < 360) {
      return (1440 - shiftStart) + clockedInMins;
    }
    return 0;
  }
}

export function calculateUndertime(clockOutTimeStr: string, shift: Shift): number {
  const clockedOutMins = timeToMinutes(clockOutTimeStr);
  const shiftEnd = shift.end;

  if (!shift.overnight) {
    if (clockedOutMins < shiftEnd) {
      return shiftEnd - clockedOutMins;
    }
    return 0;
  } else {
    // Night Shift: 22:00 (1320) to 06:00 (360)
    // If clock-out occurs before midnight (e.g., 23:00 / 1380 mins)
    if (clockedOutMins >= 1320 && clockedOutMins < 1440) {
      return (1440 - clockedOutMins) + shiftEnd;
    }
    // If clock-out occurs after midnight but before designated end (e.g., 04:00 AM)
    if (clockedOutMins < shiftEnd) {
      return shiftEnd - clockedOutMins;
    }
    return 0;
  }
}
