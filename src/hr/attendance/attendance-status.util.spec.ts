import {
  buildAttendanceHistory,
  deriveStatusCode,
} from './attendance-status.util';

describe('deriveStatusCode', () => {
  it('returns P when on approved leave', () => {
    expect(deriveStatusCode(undefined, true)).toBe('P');
  });

  it('returns Ro when no check-in and not on leave', () => {
    expect(deriveStatusCode(undefined, false)).toBe('Ro');
  });

  it('returns X for an on-time check-in', () => {
    const workStart = new Date(Date.UTC(2026, 7, 17, 1, 0, 0)); // 08:00 GMT+7
    expect(deriveStatusCode({ checkinTime: workStart }, false)).toBe('X');
  });

  it('returns M1 for a check-in past the first late threshold', () => {
    const late = new Date(Date.UTC(2026, 7, 17, 1, 30, 0)); // 30 min late
    expect(deriveStatusCode({ checkinTime: late }, false)).toBe('M1');
  });

  it('returns M2 for a check-in past the second late threshold', () => {
    const veryLate = new Date(Date.UTC(2026, 7, 17, 2, 30, 0)); // 90 min late
    expect(deriveStatusCode({ checkinTime: veryLate }, false)).toBe('M2');
  });
});

describe('buildAttendanceHistory', () => {
  it('skips weekends and only includes days up to today', () => {
    const realNow = Date;

    global.Date = class extends realNow {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super('2026-08-03T00:00:00Z');
        } else {
          super(...(args as any));
        }
      }
    } as never;

    const rows = buildAttendanceHistory({
      year: 2026,
      month: 8,
      attendances: [],
      approvedLeaveDates: new Set<string>(),
      feedbackByDate: new Map<string, number>(),
    });

    global.Date = realNow;

    // Aug 2026: 1st is Sat, 2nd is Sun, 3rd is Mon (today) — only weekday 08-03 included
    expect(rows).toEqual([
      {
        date: '2026-08-03',
        status_code: 'Ro',
        has_feedback: false,
        feedback_request_id: null,
      },
    ]);
  });
});
